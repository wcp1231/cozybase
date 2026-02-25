## Context

当前 `workspace.ts` 的 `init()` 方法（第 71-117 行）通过硬编码字符串创建 "hello" 示例应用：`writeFileSync` 直接写入 `app.yaml`、`001_init.sql` 和 `health.ts` 的内容。这种方式存在维护难度：SQL 和 TypeScript 以字符串形式嵌入，没有语法检查和编辑器支持。

本设计将引入模板目录机制，将示例应用的文件独立维护，init 时通过文件复制部署到 workspace。

## Goals / Non-Goals

**Goals:**

- 将 "hello" 示例应用替换为更完整的 "welcome" 应用（包含 TODO CRUD 功能）
- 示例应用的文件以真实文件形式维护在源码的 `packages/server/templates/` 目录中
- `init()` 方法通过递归复制模板目录来创建示例应用，不再硬编码文件内容

**Non-Goals:**

- 不构建通用的模板引擎或变量替换机制（文件原样复制）
- 不支持运行时动态选择模板（init 固定使用 welcome 模板）
- 不考虑已有 workspace 的迁移（init 仅在首次启动时运行）

## Decisions

### 1. 模板目录位置：`packages/server/templates/welcome/`

模板文件放在 server 包内，与源码一起版本管理。目录结构与实际 app 目录完全一致：

```
packages/server/templates/
└── welcome/
    ├── app.yaml
    ├── migrations/
    │   └── 001_init.sql
    ├── seeds/
    │   └── todos.sql
    └── functions/
        └── todos.ts
```

**为什么不放在项目根目录？** 模板是 server 运行时的一部分，跟随 server 包发布和部署更合理。

### 2. 复制机制：`fs.cpSync` 递归复制

使用 Node.js（Bun 兼容）的 `fs.cpSync(src, dest, { recursive: true })` 一次性复制整个模板目录到 `workspace/apps/welcome/`。

**为什么不逐文件写入？** 递归复制更简洁，且当模板文件增减时不需要修改 `init()` 代码。

**为什么不用模板引擎？** 当前没有需要动态替换的内容，原样复制最简单可靠。

### 3. 模板路径解析：`import.meta.dir` 相对定位

在 `workspace.ts` 中通过 `import.meta.dir` 获取当前模块目录，然后向上回溯到 `packages/server/`，再定位 `templates/` 目录：

```typescript
const TEMPLATES_DIR = join(import.meta.dir, '..', '..', 'templates');
```

**为什么用 `import.meta.dir`？** 这是 Bun 原生支持的方式，无需额外配置，开发和运行时行为一致。

### 4. TODO 表结构

```sql
CREATE TABLE todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

使用 `INTEGER` 表示 `completed` 布尔状态（SQLite 没有原生布尔类型）。保持字段精简，符合示例应用的教学目的。

### 5. todos Function API 设计

遵循现有 FunctionContext 模式，在单个 `todos.ts` 文件中导出 HTTP method handlers：

- `GET` — 查询所有待办事项，支持 `?status=completed|pending` 筛选
- `POST` — 创建新待办事项，body 为 `{ title: string }`
- `DELETE` — 删除指定待办事项，body 为 `{ id: number }`

**为什么用 body 传 id 而不是 URL 参数？** Function 路由模式为 `/apps/:appName/functions/:name`，不支持额外路径段。使用 request body 传递 id 是当前架构下最直接的方式。

## Risks / Trade-offs

- **`import.meta.dir` 路径假设** → 如果 server 包的目录结构变更，模板路径解析会失败。缓解：在 `init()` 中加入 `existsSync` 检查，找不到模板目录时给出明确错误信息。
- **`cpSync` 兼容性** → `fs.cpSync` 是 Node.js 16.7+ API，Bun 已支持。如果遇到兼容问题，可降级为手动递归复制。
- **Breaking change** → 新建的 workspace 不再包含 hello 应用。已有 workspace 不受影响（init 不会重复运行）。
