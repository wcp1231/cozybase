## Why

平台首次启动时当前只创建了一个极简的 "hello" 示例应用，仅包含一个 `greetings` 表和一个 `health` 函数，无法有效展示平台的核心能力（Migration、Functions、Auto CRUD API）。需要一个更完整的 "Welcome" 应用作为初始示例，让用户（尤其是 AI Agent）快速理解如何基于 cozybase 构建功能完整的应用。

## What Changes

- 引入应用模板机制：将示例应用作为真实文件维护在 `packages/server/templates/` 目录中，而非硬编码在 TypeScript 代码里。初始化时通过文件复制将模板应用部署到 workspace
- 新增 "welcome" 应用模板，替代现有的 "hello" 应用作为平台初始化时的示例应用
- welcome 模板包含完整的应用结构：
  - `app.yaml` — 应用声明
  - `migrations/001_init.sql` — 创建 `todo` 表，包含标题、状态、创建时间等字段
  - `seeds/todos.sql` — 预置若干示例待办事项
  - `functions/todos.ts` — 待办事项 API 接口：
    - `GET` — 查询待办事项列表（支持按状态筛选）
    - `POST` — 添加新的待办事项
    - `DELETE` — 删除指定待办事项
- **BREAKING**: 移除现有的 "hello" 示例应用（硬编码方式）

## Capabilities

### New Capabilities

- `welcome-app-scaffold`: Welcome 应用模板的完整定义，以真实文件形式维护在 `packages/server/templates/welcome/` 目录中，包括 `app.yaml`、Migration（`todo` 表）、Seed 数据、以及 `todos` Function 的实现

### Modified Capabilities

- `workspace-management`: 平台初始化逻辑从硬编码方式改为基于模板目录的文件复制机制，并将默认示例应用从 "hello" 替换为 "welcome"

## Impact

- **代码**: `packages/server/src/core/workspace.ts` 中的 `init()` 方法需要重构，从硬编码字符串改为读取 `templates/` 目录并复制文件到 workspace
- **新增目录**: `packages/server/templates/welcome/` 存放模板应用的真实文件
- **测试**: 现有引用 "hello" 应用的测试需要更新为 "welcome"
- **文档**: `README.md` 中如有 hello 应用的示例说明需同步更新
- **向后兼容**: 已存在的 workspace 不受影响（init 仅在首次启动时执行），但新初始化的 workspace 将不再包含 hello 应用
- **可扩展性**: 未来可轻松添加更多模板应用，只需在 `templates/` 下新建目录即可
