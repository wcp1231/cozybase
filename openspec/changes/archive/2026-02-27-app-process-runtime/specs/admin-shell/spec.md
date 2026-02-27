## MODIFIED Requirements

### Requirement: Admin SPA 路由结构变更

Admin SPA 路由 SHALL 保持不变，但 APP 视图页面从直接渲染 SchemaRenderer 变为通过 iframe 嵌入 APP UI。

#### Scenario: APP 页面路由
- **WHEN** 用户访问 `/apps/:appName/:pageId`
- **THEN** Admin 渲染 iframe 容器，设置 `src` 为 APP 的 Runtime UI 地址（`/stable/apps/:appName/`），而非直接在 Admin 内渲染 SchemaRenderer

#### Scenario: APP 列表页不变
- **WHEN** 用户访问 `/apps`
- **THEN** Admin 仍通过 `GET /api/v1/apps` 获取 APP 列表并渲染，逻辑不变

### Requirement: App 视图加载变更

Admin SHALL 通过 iframe 加载 APP UI，不再直接调用 SchemaRenderer。

#### Scenario: iframe 加载 APP UI
- **WHEN** 用户在 Admin 中选择某个 APP
- **THEN** Admin 创建 `<iframe src="/stable/apps/:appName/"></iframe>`
- **AND** iframe 加载 APP 自身的完整 UI（包含 SchemaRenderer、UI Schema 和所有静态资源）

#### Scenario: iframe 加载状态
- **WHEN** iframe 正在加载 APP UI
- **THEN** Admin 显示 loading 状态
- **AND** iframe 的 `onload` 事件触发后，Admin 通过 postMessage 发送 `auth-token` 和 `theme-update`

#### Scenario: iframe 加载失败
- **WHEN** APP UI 加载失败（如 APP 未启动或不存在）
- **THEN** Admin 显示错误提示信息

### Requirement: Admin 导航布局适配

Admin 导航布局 SHALL 通过 postMessage 与 iframe 中的 APP UI 同步页面导航和标题。

#### Scenario: 侧边栏页面列表
- **WHEN** Admin 加载 APP 视图
- **THEN** Admin 通过 `GET /stable/apps/:appName/ui.json` 获取 APP 的页面列表，在侧边栏显示

#### Scenario: 侧边栏页面切换
- **WHEN** 用户在 Admin 侧边栏点击某个页面
- **THEN** Admin 通过 `postMessage({ type: 'navigate', payload: { pageId: '...' } })` 通知 iframe 中的 APP UI 切换页面

#### Scenario: APP 通知页面变更
- **WHEN** APP UI 在 iframe 内部发生页面切换
- **THEN** APP UI 通过 `postMessage({ type: 'navigation-changed', payload: 'pageId' })` 通知 Admin
- **AND** Admin 更新侧边栏的高亮状态和顶部栏标题

### Requirement: Server 静态文件 Serve 变更

Admin SPA 的静态文件 serve SHALL 保留在 Daemon 中，APP 的 UI 静态文件 serve 迁移到 Runtime。

#### Scenario: Daemon serve Admin SPA
- **WHEN** 客户端请求 `/admin/*` 或未匹配 API 路由的路径
- **THEN** Daemon 返回 Admin SPA 的静态文件，SPA fallback 逻辑不变

#### Scenario: Runtime serve APP UI
- **WHEN** 客户端请求 `/stable/apps/:name/` 或 `/stable/apps/:name/assets/*`
- **THEN** 请求经 Daemon mount 到达 Runtime，Runtime 从 APP 注册表条目的 `uiDir` serve 静态文件

### Requirement: 构建流程变更

构建顺序 SHALL 调整为 `ui → admin → runtime → daemon`，新增 `packages/runtime` 的构建步骤。

#### Scenario: 构建顺序
- **WHEN** 执行全量构建
- **THEN** 按照如下顺序构建：
  1. `packages/ui` — SchemaRenderer 组件库
  2. `packages/admin` — Admin SPA
  3. `packages/runtime` — APP Runtime
  4. `packages/daemon` — Daemon（依赖 runtime）

#### Scenario: Admin 不再依赖 SchemaRenderer 渲染
- **WHEN** Admin SPA 构建
- **THEN** Admin 不再打包 SchemaRenderer 组件（只需要 iframe 容器），构建产物体积减小
