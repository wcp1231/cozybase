## MODIFIED Requirements

### Requirement: update_app_file 工具

`update_app_file` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `path` | string | 是 | 文件路径 |
| `content` | string | 是 | 文件内容 |

此工具用于快速更新单个文件，不需要传入完整文件列表和 base_version。

工具描述 SHALL 补充 UI 文件相关的指引信息，告知 Agent：
- APP 的 UI 定义存储在 `ui/pages.json` 文件中
- `ui/pages.json` 使用 JSON 格式，包含 `pages`（页面列表）和 `components`（可选的自定义组件声明）
- 每个 page 包含 `id`、`title`、`body` 字段（`id` 同时作为路由路径段）
- body 中的组件通过 `type` 指定类型，可用的内置组件类型包括：`page`、`row`、`col`、`card`、`tabs`、`divider`、`table`、`list`、`text`、`heading`、`tag`、`stat`、`form`、`input`、`textarea`、`number`、`select`、`switch`、`checkbox`、`radio`、`date-picker`、`button`、`link`、`dialog`、`alert`、`empty`
- 交互行为通过 action 声明，支持的 action 类型：`api`、`reload`、`dialog`、`link`、`close`、`confirm`
- API URL 使用 App 相对路径（如 `/db/todo`、`/functions/todos`），渲染器自动补全

#### Scenario: Agent 更新 UI 文件

- **WHEN** Agent 调用 `update_app_file(app_name: "welcome", path: "ui/pages.json", content: "...")`
- **THEN** 工具 SHALL 调用 `PUT /api/v1/apps/welcome/files/ui/pages.json`，更新 UI 定义内容

#### Scenario: Agent 更新其他文件

- **WHEN** Agent 调用 `update_app_file(app_name: "blog", path: "functions/posts.ts", content: "...")`
- **THEN** 工具 SHALL 调用 `PUT /api/v1/apps/blog/files/functions/posts.ts`，更新文件内容（行为不变）

### Requirement: Checkout-Edit-Push 工作流

MCP 工具集 SHALL 支持 Checkout-Edit-Push 工作流模式，这是 Agent 操作 APP 的推荐流程：

1. **Checkout**: `fetch_app(app_name)` — 获取完整快照（含 `current_version`）
2. **Edit**: Agent 在本地/内存中编辑文件列表
3. **Push**: `update_app(app_name, base_version, files)` — 推回修改（含乐观锁）
4. **Reconcile**: `reconcile(app_name)` — 重建 Draft DB 验证 schema
5. **Verify**: `verify(app_name)` — 验证 migration 可在 Stable 上执行
6. **Publish**: `publish(app_name)` — 发布到 Stable

对于小修改，Agent 也可以使用 `update_app_file` 跳过完整的 Checkout-Edit-Push 流程。

当 Agent 仅修改 UI 定义（`ui/pages.json`）时，不需要执行 Reconcile / Verify / Publish 流程，因为 UI 文件不涉及数据库 schema 变更。工具描述 SHALL 明确告知 Agent 这一点。

#### Scenario: Agent 完整开发流程

- **WHEN** Agent 需要为 blog APP 添加评论功能
- **THEN** Agent SHALL 依次调用 fetch_app → 编辑 files（新增 migration 和 function）→ update_app → reconcile → verify → publish

#### Scenario: Agent 小修改流程

- **WHEN** Agent 只需要修改一个 function 文件
- **THEN** Agent SHALL 直接调用 update_app_file → reconcile

#### Scenario: Agent 仅修改 UI 定义

- **WHEN** Agent 只需要修改 APP 的 UI 界面（`ui/pages.json`）
- **THEN** Agent SHALL 直接调用 `update_app_file(app_name, "ui/pages.json", content)` 即可，不需要 reconcile / verify / publish
