## MODIFIED Requirements

### Requirement: App 视图加载

Admin SHALL 在进入 App 页面时从 Stable 环境加载该 App 的 UI 定义，并传递给 `SchemaRenderer` 渲染。

加载流程：
1. 调用 `GET /stable/apps/:appName/ui` 获取已 reconcile 的 UI 定义
2. 若返回 200，解析 response body 中的 `data` 字段为 `PagesJson`
3. 根据当前路由的 `pageId` 找到对应的 `PageSchema`
4. 构造 `baseUrl`（`/stable/apps/:appName`），传给 `SchemaRenderer`

加载过程中 SHALL 显示 loading 状态。

错误处理：
- 若 API 返回 404（UI 定义未找到），SHALL 显示提示信息："该 App 的 UI 尚未发布，请先执行 reconcile 和 publish"
- 若 API 返回其他错误或 JSON 解析失败，SHALL 显示错误信息

App 元数据（name、description、state 等）仍通过 `GET /api/v1/apps/:appName` 获取，但 UI 定义 SHALL 从 Stable UI 端点获取。

#### Scenario: 正常加载 App UI

- **WHEN** 进入 `/apps/welcome/todo-list`
- **THEN** Admin SHALL 调用 `GET /stable/apps/welcome/ui` 获取 UI 定义，找到 `todo-list` 页面，构造 baseUrl 为 `/stable/apps/welcome`，渲染 SchemaRenderer

#### Scenario: UI 未发布

- **WHEN** 进入 `/apps/new-app`，但 `GET /stable/apps/new-app/ui` 返回 404
- **THEN** Admin SHALL 显示 "该 App 的 UI 尚未发布，请先执行 reconcile 和 publish" 的提示

#### Scenario: 页面不存在

- **WHEN** 进入 `/apps/welcome/nonexistent`，但 pages.json 中没有 id 为 `nonexistent` 的页面
- **THEN** Admin SHALL 显示 "页面不存在" 的错误提示

#### Scenario: API 请求失败

- **WHEN** `GET /stable/apps/todo-app/ui` 返回 500 或网络错误
- **THEN** Admin SHALL 显示 "加载 UI 定义失败" 的错误信息
