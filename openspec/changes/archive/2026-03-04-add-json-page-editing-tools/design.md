## Context

当前 Agent 编辑 `ui/pages.json` 依赖 `update_app_file` 工具对整文件进行读写。`pages.json` 是一棵层级深、异构嵌套的 UI 描述树，包含 26 种内置组件类型和自定义组件。

现有架构关键点：

- **Schema 定义**：`packages/ui/src/schema/types.ts`（385 行手写 TypeScript 接口），所有组件 `extends ComponentBase`，通过 `ComponentSchema` union type 聚合。
- **渲染引擎**：`packages/ui/src/renderer.tsx` 递归渲染，通过 `builtinRegistry`（Map）查找组件，有 ErrorBoundary 兜底但无写入前校验。
- **MCP 工具注册**：daemon 和 SDK 两个 MCP server 都使用 Zod schema 定义工具入参，处理函数在 `handlers.ts`。
- **Working copy 机制**：Agent 通过 `app-dir.ts` 的文件读写函数操作本地工作目录，`AppManager.updateFile()` 负责持久化到 SQLite。
- **现有依赖**：项目已使用 `zod@^3.24.0` 和 `nanoid@^5.1.0`，无需引入新依赖。
- **Guide 同步**：`sync-ui-guide-props.ts` 从 TypeScript 接口解析属性并生成 Markdown 文档。

核心问题：`id` 可选导致节点不可稳定寻址；无运行时校验导致 AI 写入错误 JSON 只在渲染时暴露；整文件读写浪费上下文且局部修改脆弱。

## Goals / Non-Goals

**Goals:**

- 用 Zod schema 替换手写 TypeScript 接口，实现类型定义与运行时校验的单一可信源。
- 所有组件节点强制稳定 ID，由工具自动生成，格式 `{type}-{random}`。
- 提供面向 Agent 的结构化页面编辑工具（outline / get / insert / update / move / delete），工具层严格校验，校验不过拒绝写入。
- 提供通用 JSON 文档的局部读取与更新工具，减少整文件读写。
- 按组件类别建立 mixin 分类，为工具层提供智能校验基础。

**Non-Goals:**

- 不改变渲染引擎的运行逻辑，渲染器继续使用 `ComponentSchema` 类型。
- 不引入可视化页面编辑器或拖拽能力。
- 不变更 `fetch_app` / `update_app` 的整体工作流，新工具是 `update_app_file` 的补充而非替代。
- 不在本次改动中处理 custom component 的校验（后续扩展）。

## Decisions

### 1. Zod Schema 作为单一可信源

**决策**：将 `packages/ui/src/schema/types.ts` 改写为 Zod schema 定义，TypeScript 类型通过 `z.infer` 导出。

**替代方案**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Zod schema（选定）** | 和现有 MCP 工具 Zod 用法一致；discriminatedUnion 适配 `type` 字段；`z.infer` 保持类型兼容；错误信息友好 | 需要迁移 ~385 行 types.ts |
| JSON Schema + ajv | 标准格式，AI 原生理解 | union/discriminated type 写法冗长；生成的 TS 类型可读性差；项目未使用 ajv |
| 手写校验函数 | 零依赖，完全控制 | 两份定义容易不同步；不是真正的单一可信源 |

选择 Zod 因为项目已有 `zod@^3.24.0` 依赖，且 MCP 工具入参已用 Zod 定义（`server.ts`、`sdk-mcp-server.ts`），风格一致。

**文件结构**：

```
packages/ui/src/schema/
├── zod.ts          # Zod schema 定义（可信源）
├── types.ts        # export type XxxSchema = z.infer<typeof xxxSchema>（兼容层）
└── validate.ts     # 导出校验函数：validatePagesJson(), validateComponent()
```

**Zod schema 组织方式**：

```typescript
// zod.ts
import { z } from 'zod';

// ComponentBase — 所有组件共享
const componentBaseSchema = z.object({
  type: z.string(),
  id: z.string(),          // 必填
  visible: z.union([z.string(), z.boolean()]).optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
});

// 按类别定义各组件 schema，使用 .extend() 继承 base
const tableComponentSchema = componentBaseSchema.extend({
  type: z.literal('table'),
  api: apiConfigSchema,
  columns: z.array(columnSchema),
  rowActions: z.array(rowActionSchema).optional(),
  pagination: z.boolean().optional(),
  pageSize: z.number().optional(),
});

// ... 其余组件类似

// discriminatedUnion 聚合
const componentSchema = z.discriminatedUnion('type', [
  pageComponentSchema,
  rowComponentSchema,
  // ... 全部 26 种
]);
```

### 2. 属性分类标准化（Mixin 模式）

**决策**：不是在 Zod schema 里用 TypeScript mixin，而是在校验/工具层维护一个组件分类映射表，用于智能校验和工具行为推断。

**分类定义**：

```typescript
// schema/categories.ts
export const componentCategories = {
  container: ['page', 'row', 'col', 'card', 'dialog'],
  text:      ['text', 'heading', 'tag', 'link'],
  input:     ['input', 'textarea', 'number', 'select', 'switch', 'checkbox', 'radio', 'date-picker'],
  data:      ['table', 'list', 'form'],
  action:    ['button', 'link'],
  feedback:  ['alert', 'empty'],
} as const;

// 每个分类对应的共性行为
export const categoryTraits = {
  container: { hasChildren: true },
  input:     { hasValue: true, hasOnChange: true },
  data:      { hasApi: true },
  action:    { hasAction: true },
};
```

工具层利用分类实现：
- insert 时按分类校验必填字段（如 data 类必须有 `api`）
- insert container 类时自动初始化 `children: []`
- outline 时按分类标注节点类型

### 3. 稳定 ID 策略

**决策**：`id` 为必填字段，格式 `{type}-{nanoid(5)}`，由工具自动生成。

**具体规则**：
- 新节点：工具在 insert 时调用 `nanoid(5)` 生成，如 `btn-a7x3k`、`table-k8m2p`。
- 已有无 ID 数据：规范化阶段（normalize）自动补齐 ID 并写回文件。
- 工具接口不暴露 `id` 参数，AI 不可指定 ID。
- AI 通过工具返回值获得节点 ID，后续用 ID 做 update / delete / move。
- `PageSchema.id` 保持现有行为（用户指定的路由 ID），不自动生成。

**ID 生成函数**：

```typescript
// schema/id.ts
import { nanoid } from 'nanoid';

export function generateNodeId(type: string): string {
  return `${type}-${nanoid(5)}`;
}
```

**规范化流程**：

```typescript
// schema/normalize.ts
export function normalizePagesJson(raw: unknown): PagesJson {
  // 1. 递归遍历所有节点
  // 2. 缺少 id 的节点 → generateNodeId(type)
  // 3. Zod parse 校验
  // 4. 返回规范化后的结构
}
```

### 4. 校验层次与执行

**决策**：三层校验，全部在工具写入前执行，任一层失败则拒绝写入。

**Layer 1 — 基础校验（Zod schema 自动完成）**：
- `type` 字段存在且为合法类型名
- `id` 字段存在且为 string
- ComponentBase 公共字段类型正确
- children / body 元素递归合法
- discriminatedUnion 自动拒绝未知 type

**Layer 2 — 结构校验（Zod schema 的 required 字段自动完成）**：
- table 必须有 `api` + `columns`
- select / radio 必须有 `options`
- form 必须有 `fields`
- action type 必须是 6 种之一
- 按分类检查必填字段

**Layer 3 — 语义校验（自定义 refine / 后处理）**：
- `reload.target` 引用的 ID 必须在当前页面树中存在
- 表达式 `${...}` 中引用的 scope 变量格式合法
- 组件 ID 在整个 pages.json 中唯一

```typescript
// validate.ts
export function validatePagesJson(data: unknown): ValidationResult {
  // Layer 1+2: Zod parse
  const parsed = pagesJsonSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: formatZodErrors(parsed.error) };
  }

  // Layer 3: 语义校验
  const semanticErrors = checkSemanticRules(parsed.data);
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }

  return { ok: true, data: parsed.data };
}
```

### 5. 工具接口设计

**决策**：新增两组 MCP 工具，注册在 daemon MCP server 和 SDK MCP server。

**决策**：只提供专用于 `ui/pages.json` 的 Page Schema 编辑工具，不提供通用 JSON 文档工具。Agent 编辑其他 JSON 文件继续使用 `update_app_file`。

| 工具 | 用途 | 入参 |
|------|------|------|
| `page_outline` | 返回页面树大纲 | `pageId?: string`（可选，限定某一页） |
| `page_get` | 读取指定节点详情 | `nodeId: string` |
| `page_insert` | 插入新节点 | `parentId: string`, `index?: number`, `node: object`（不含 id） |
| `page_update` | 更新节点属性 | `nodeId: string`, `props: object`（不含 id、type） |
| `page_move` | 移动节点 | `nodeId: string`, `newParentId: string`, `index?: number` |
| `page_delete` | 删除节点 | `nodeId: string` |

**工具执行流程（以 `page_insert` 为例）**：

```
Agent 调用 page_insert({ parentId: "row-k8m2p", node: { type: "button", label: "Save" } })
  │
  ├─ 1. 读取 pages.json working copy
  ├─ 2. 查找 parentId 对应的节点（不存在 → 报错）
  ├─ 3. 为新节点生成 ID: "btn-a7x3k"
  ├─ 4. 将 { id: "btn-a7x3k", type: "button", label: "Save" } 插入 parent.children
  ├─ 5. Zod 校验整个 pages.json（失败 → 回滚，报错）
  ├─ 6. 语义校验（失败 → 回滚，报错）
  ├─ 7. 写回 working copy
  └─ 8. 返回 { id: "btn-a7x3k", type: "button", label: "Save" }
```

**`page_outline` 返回格式**：

```json
{
  "pages": [
    {
      "id": "todo-list",
      "title": "TODO List",
      "body": [
        { "id": "hdg-x2k9p", "type": "heading", "summary": "TODO List" },
        { "id": "row-k8m2p", "type": "row", "children": [
          { "id": "tabs-m3n7q", "type": "tabs", "summary": "3 items" },
          { "id": "btn-a7x3k", "type": "button", "summary": "New Todo" }
        ]},
        { "id": "tbl-p9r4s", "type": "table", "summary": "api:/fn/_db/tables/todo, 2 columns" }
      ]
    }
  ]
}
```

大纲只返回 id、type、结构层级和摘要信息，不返回完整属性，减少上下文消耗。

**`summary` 生成规则**：按组件分类从最有辨识度的字段提取摘要：

| 分类 | 摘要来源 | 示例 |
|------|---------|------|
| container（page/row/col/card/dialog） | 子节点数量 | `"3 children"` |
| text/heading/tag | 截断文本内容 | `"TODO List"` |
| table | api url + 列数 | `"api:/fn/_db/tables/todo, 2 columns"` |
| list | api url | `"api:/fn/_db/tables/todo"` |
| form | 字段数 | `"3 fields"` |
| button/link | label/text 值 | `"New Todo"` |
| tabs | item 数量 | `"3 items"` |
| input 类 | placeholder 或类型 | `"Enter title..."` |
| feedback（alert/empty） | message 截断 | `"No data available"` |

### 6. 工具注册位置

**决策**：遵循现有模式，在 `mcp-types.ts` 定义工具描述和 Zod 入参 schema，在 `handlers.ts` 实现处理逻辑，在两个 MCP server 中注册。

新增文件：

```
packages/daemon/src/mcp/
├── handlers.ts             # 追加 page_* handler
└── ...

packages/daemon/src/modules/apps/
├── mcp-types.ts            # 追加工具描述和入参 schema
└── page-editor.ts          # (新) page 编辑核心逻辑：查找节点、插入、移动、删除

packages/ui/src/schema/
├── zod.ts                  # (新) Zod schema 可信源
├── types.ts                # (改) 改为从 zod.ts 导出 z.infer 类型
├── validate.ts             # (新) 校验函数
├── normalize.ts            # (新) 规范化（补齐 ID 等）
├── id.ts                   # (新) ID 生成
└── categories.ts           # (新) 组件分类映射
```

## Risks / Trade-offs

**[types.ts 迁移影响范围] → 渐进迁移**
将 types.ts 改为 `z.infer` 导出可能影响所有导入方。通过保持 `types.ts` 文件名和导出名不变来降低风险——只改内部实现，接口不变。`import type { ComponentSchema } from './schema/types'` 在改造前后行为一致。

**[整文件校验性能] → 增量校验**
每次 insert/update/delete 后校验整个 pages.json 在页面数较多时可能有性能问题。初期接受全量校验（文件通常不大），后续可优化为只校验受影响的子树。

**[ID 补齐的破坏性] → 首次 fetch 时规范化**
已有的无 ID pages.json 在首次通过工具操作时会被补齐 ID，这会产生大量 diff。可以在 `fetch_app` 返回 working copy 时自动规范化，让 Agent 从一开始就看到带 ID 的结构。

**[Zod discriminatedUnion 的限制] → CustomComponentInstance 特殊处理**
`CustomComponentInstance` 的 type 是动态的（由用户定义），无法列举在 discriminatedUnion 中。需要先用 discriminatedUnion 匹配 26 种内置类型，fallback 到 `componentBaseSchema` 处理自定义组件。

**[语义校验的完备性] → 逐步完善**
Layer 3 语义校验（引用检查、表达式合法性）难以做到完备。初期只校验 `reload.target` 引用有效性和 ID 唯一性，表达式语法校验后续迭代。

## Open Questions

- `page_update` 是否允许修改 `type` 字段？修改 type 意味着节点结构完全改变，可能应该要求 delete + insert 而非 update。
- 已有 `update_app_file` 工具继续保留，但 Agent 能否通过它直接写入不合法的 pages.json 绕过校验？是否需要在 `update_app_file` 对 `ui/pages.json` 也加校验拦截？
