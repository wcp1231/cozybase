## Context

当前 `page-editor.ts` 中每个操作函数（`insertNode`, `updateNode`, `deleteNode`, `moveNode`, `getNode`）都独立执行完整的文件 I/O 循环：`readPagesJson()` → 内存修改 → `writePagesJson()`。构建一个包含 10 个组件的页面布局需要 10+ 次 LLM 工具调用，每次都触发文件读写和 Zod 全量校验。

此外，嵌套布局存在操作间依赖：先 insert 一个 `row`，再往这个 `row` 里 insert `col`——但当前工具无法在同一次调用中引用前序操作生成的自动 ID。

MCP 工具注册在两处（`server.ts` 和 `sdk-mcp-server.ts`），两者共享同一套 handler，新工具需要同步注册。

## Goals / Non-Goals

**Goals:**

- 提供 `ui_batch` 工具，单次调用执行多个混合操作（insert/update/delete/move/get + page_add/page_remove/page_update）
- 通过 `$ref` 引用机制解决操作间依赖（前序 insert 的生成 ID 可被后续操作引用）
- 一次文件读取、多次内存操作、一次文件写入，减少 I/O 和校验开销
- 部分成功策略：单个操作失败不阻断无关后续操作
- 现有单操作工具（`ui_insert` 等）行为完全不变

**Non-Goals:**

- 不引入事务回滚机制（不需要 all-or-nothing 语义）
- 不对现有单操作工具的外部接口做任何修改
- 不支持条件执行（if/else 逻辑）
- 不在 batch 中支持 `ui_outline` 操作（outline 是全量读取，不适合混入 batch）

## Decisions

### Decision 1: 拆分 InMemory 操作层

**选择**: 将 `page-editor.ts` 中每个操作函数拆为两层——纯内存操作函数和文件 I/O 包装函数。

```typescript
// 纯内存操作（不读写文件）
function insertNodeInMemory(data: PagesJson, parentId: string, nodeData: Record<string, unknown>, index?: number): { node: ComponentSchema; nodeId: string }

// 保持原有签名（调用 InMemory + 文件 I/O）
function insertNode(ctx: PageEditorContext, parentId: string, nodeData: Record<string, unknown>, index?: number): ComponentSchema
```

**理由**: 最小改动实现复用。现有单操作工具的行为不变，batch 工具复用 InMemory 函数。拆分后也更易于测试——InMemory 函数是纯函数，不依赖文件系统。

**替代方案**: 让现有函数接受可选的 `PagesJson` 参数——但这会改变所有现有函数的签名，增加混淆风险。

### Decision 2: `$ref` 引用机制

**选择**: 用 `$` 前缀标识引用名。操作中 `ref` 字段声明引用名，`parent_id` / `node_id` 字段中以 `$` 开头的值从 refMap 解析。

```typescript
// 执行时维护
const refMap = new Map<string, string>();  // "$row" → "row-a7x3k"

// 解析逻辑
function resolveRef(value: string, refMap: Map<string, string>): string {
  return value.startsWith('$') ? refMap.get(value) ?? value : value;
}
```

**理由**: 现有 node ID 格式为 `type-xxxxx`（如 `btn-a7x3k`），永远不会以 `$` 开头，因此不存在冲突。`$` 前缀在 DSL 中也是常见的变量引用约定。

**替代方案**: 用数字索引引用（如 `{ parent_id: { fromOp: 0 } }`）——语法更复杂，可读性差。

### Decision 3: 部分成功 + 级联跳过

**选择**: 操作按顺序执行，失败的操作标记 `error`，后续不依赖它的操作继续执行。但如果某操作的 `parent_id` 或 `node_id` 引用了一个失败或被跳过的 `$ref`，该操作标记 `skipped`。

```
op[0] insert ref="$row"  → error（parent 不存在）
op[1] insert parent="$row" → skipped（依赖失败的 $row）
op[2] update node_id="existing-btn" → ok（不依赖 $row，正常执行）
```

**理由**: 符合用户预期——失败的操作不应该影响无关的操作，但依赖链断裂时应自动跳过而非报错（避免级联错误信息噪音）。

**替代方案**: 全部回滚（事务语义）——对 Agent 使用场景过于严格，LLM 更需要知道哪些成功了以便修正失败的部分。

### Decision 4: 写入时机

**选择**: 只要有任何写操作（insert/update/delete/move/page_add/page_remove/page_update）成功执行，就执行一次 `writePagesJson()`。如果所有操作都是 `get`（纯读取），或所有写操作都失败/被跳过，则不写入文件。

**理由**: 避免无意义的写入。batch 中可能只有 get 操作（批量读取场景），此时不应触发写入。

### Decision 5: page 级操作纳入 batch

**选择**: batch 中支持 `page_add`、`page_remove`、`page_update` 操作。`page_add` 创建的页面 ID 可作为后续 insert 操作的 `parent_id`。

```typescript
{ op: "page_add", ref: "$newPage", id: "settings", title: "Settings" },
{ op: "insert", parent_id: "settings", node: { type: "heading", text: "Settings" } },
```

注意：`page_add` 的 `ref` 指向的是 page ID（用户指定的，如 `"settings"`），而非自动生成的 ID。refMap 中存的是 page ID。

**理由**: "创建页面并填充内容"是最常见的批量场景之一，拆成两步（先 `pages_add` 再 `ui_batch`）反而增加复杂度。

### Decision 6: Zod schema 设计

**选择**: 使用 `z.discriminatedUnion("op", [...])` 定义操作类型。

```typescript
const BatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("get"), ref: z.string().optional(), node_id: z.string() }),
  z.object({ op: z.literal("insert"), ref: z.string().optional(), parent_id: z.string(), node: z.record(z.unknown()), index: z.number().optional() }),
  z.object({ op: z.literal("update"), ref: z.string().optional(), node_id: z.string(), props: z.record(z.unknown()) }),
  z.object({ op: z.literal("delete"), node_id: z.string() }),
  z.object({ op: z.literal("move"), ref: z.string().optional(), node_id: z.string(), new_parent_id: z.string(), index: z.number().optional() }),
  z.object({ op: z.literal("page_add"), ref: z.string().optional(), id: z.string(), title: z.string(), index: z.number().optional() }),
  z.object({ op: z.literal("page_remove"), page_id: z.string() }),
  z.object({ op: z.literal("page_update"), page_id: z.string(), title: z.string() }),
]);
```

**理由**: `discriminatedUnion` 让 Zod 根据 `op` 字段自动选择正确的子 schema，错误信息更精准。LLM 也更容易理解每种操作需要哪些字段。

## Risks / Trade-offs

- **大批量操作的校验延迟**: 所有操作执行完后统一做一次 Zod 校验。如果前面 insert 了非法节点，要到最后 `writePagesJson()` 才会报错，此时前面的操作已经在内存中执行了 → 缓解措施：InMemory 函数内做基本检查（parent 存在性、container 类型检查），Zod 校验仅作为最终兜底。如果 Zod 校验失败则整个 batch 不写入，返回 `committed: false`。
- **refMap 命名冲突**: 如果用户在同一个 batch 中给两个操作相同的 `ref` 名 → 后者覆盖前者。可以选择报错，但为简单起见，后者覆盖前者（与变量赋值语义一致）。
- **操作数量限制**: 不设硬限制，但建议文档中标注单次 batch 不超过 50 个操作。极端情况下内存中的 `PagesJson` 对象可能很大，但实际应用中页面 JSON 通常在几十 KB 级别，不构成问题。
