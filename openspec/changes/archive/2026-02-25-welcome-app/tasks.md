## 1. 创建 Welcome 应用模板文件

- [x] 1.1 创建 `packages/server/templates/welcome/` 目录结构（`migrations/`、`seeds/`、`functions/`）
- [x] 1.2 创建 `packages/server/templates/welcome/app.yaml`，内容为 `description: "Welcome - TODO App"`
- [x] 1.3 创建 `packages/server/templates/welcome/migrations/001_init.sql`，包含 `todo` 表的 CREATE TABLE 语句（id, title, completed, created_at）
- [x] 1.4 创建 `packages/server/templates/welcome/seeds/todos.sql`，包含至少 3 条示例数据（覆盖已完成和未完成状态）
- [x] 1.5 创建 `packages/server/templates/welcome/functions/todos.ts`，实现 GET handler（查询所有待办事项，支持 `?status=completed|pending` 筛选）
- [x] 1.6 在 `todos.ts` 中实现 POST handler（创建待办事项，校验 title 必填，返回完整记录）
- [x] 1.7 在 `todos.ts` 中实现 DELETE handler（删除待办事项，校验 id 必填，处理记录不存在的情况）

## 2. 重构 Workspace 初始化逻辑

- [x] 2.1 在 `packages/server/src/core/workspace.ts` 中添加 `TEMPLATES_DIR` 常量，使用 `import.meta.dir` 相对定位到 `packages/server/templates/`
- [x] 2.2 重构 `init()` 方法：移除硬编码的 hello 应用创建逻辑（第 91-111 行）
- [x] 2.3 在 `init()` 中实现模板复制逻辑：扫描 `TEMPLATES_DIR` 下的子目录，使用 `fs.cpSync` 递归复制到 `apps/` 目录
- [x] 2.4 添加降级处理：模板目录不存在或为空时打印警告并跳过复制

## 3. 更新测试

- [x] 3.1 更新现有测试中对 "hello" 应用的引用，替换为 "welcome"
- [x] 3.2 验证 workspace 初始化后 `apps/welcome/` 目录内容的完整性（包含 app.yaml、migration、seed、function）
- [x] 3.3 验证 `todos.ts` 的 GET/POST/DELETE 三个 handler 的功能正确性
