## MODIFIED Requirements

### Requirement: Admin SPA 路由结构

Admin SHALL 作为单页应用（SPA），提供以下路由结构：

| 路由 | 说明 |
|------|------|
| `/` | 首页，重定向到 `/apps` |
| `/apps` | App 列表页 |
| `/apps/:appName` | App 详情页，重定向到该 App 的第一个 UI 页面 |
| `/apps/:appName/:pageId` | 在 Admin Shell 的中心 content slot 中渲染指定 App 页面 |

Admin 的所有路由 SHALL 在客户端处理（client-side routing）。Server 对于未匹配的非 API 路径 SHALL 返回 `index.html`（SPA fallback）。

#### Scenario: 访问首页
- **WHEN** 用户访问 `/`
- **THEN** Admin SHALL 重定向到 `/apps`

#### Scenario: 访问 App 默认页面
- **WHEN** 用户访问 `/apps/welcome`，welcome 的第一个页面为 `todo-list`
- **THEN** Admin SHALL 重定向到 `/apps/welcome/todo-list`

#### Scenario: 访问 App 指定页面
- **WHEN** 用户访问 `/apps/welcome/todo-list`
- **THEN** Admin SHALL 在中心 content slot 渲染 `todo-list` 页面

### Requirement: App 视图加载

Admin SHALL 在 Shell 的中心 content slot 中加载 APP 页面内容。App 页面数据 SHALL 通过 `GET /stable/apps/:appName/ui` 获取，并由 SchemaRenderer 渲染指定 `pageId`。

当 App 不存在、无 UI 配置或 pageId 不存在时，Admin SHALL 在 content slot 内显示错误/空状态，不得导致整个 Shell 崩溃。

#### Scenario: 在 content slot 渲染 App 页面
- **WHEN** 路由为 `/apps/myapp/overview`
- **THEN** Admin SHALL 请求 `/stable/apps/myapp/ui`
- **AND** 在 content slot 中渲染 `overview` 页面

#### Scenario: App 无 UI
- **WHEN** 路由为 `/apps/myapp/overview`，但 `myapp` 没有 `ui/pages.json`
- **THEN** Admin SHALL 在 content slot 显示“该 App 暂无 UI 界面”提示

#### Scenario: 页面不存在
- **WHEN** 路由为 `/apps/myapp/nonexistent`，但 pages 中不存在该 pageId
- **THEN** Admin SHALL 在 content slot 显示“页面不存在”错误提示

### Requirement: Admin 导航布局

Admin 顶层导航布局 SHALL 保持硬编码实现，并采用固定三栏结构：
- 左侧 sidebar：显示 App/页面导航
- 中间 content slot：显示当前目标页面
- 右侧 chat window：显示辅助对话区（首期可为占位实现）

路由切换时，Shell 外层布局 SHALL 保持稳定，仅替换中心 content slot 的内容。

#### Scenario: 固定三栏布局
- **WHEN** 用户进入任意 `/apps/*` 路由
- **THEN** Admin SHALL 渲染左侧 sidebar、中心 content slot、右侧 chat window 三栏结构

#### Scenario: 路由切换仅更新 slot
- **WHEN** 用户从 `/apps/a/page-1` 切换到 `/apps/b/page-2`
- **THEN** Admin SHALL 保持 sidebar/chat 不重建
- **AND** 仅更新中心 content slot 内容
