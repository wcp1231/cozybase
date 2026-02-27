# APP UI Independent

## Purpose

Define the architecture for APP UI independence, enabling each APP to run its own complete UI via iframe embedding with secure postMessage communication and theme synchronization with the Admin shell.

## Requirements

### Requirement: APP UI 独立运行

每个 APP SHALL 自带完整的 UI 运行能力，包含打包后的 SchemaRenderer（`@cozybase/ui` npm 包）和页面定义。APP UI 通过 Runtime 的静态文件路由独立 serve。

#### Scenario: APP UI 独立访问
- **WHEN** 客户端直接访问 `/stable/apps/todo/`
- **THEN** Runtime 从 `todo:stable` 的 `uiDir` 返回完整的 HTML 页面，包含内联的 SchemaRenderer 和 UI Schema

#### Scenario: APP UI 静态资源
- **WHEN** 客户端请求 `/stable/apps/todo/assets/main.js`
- **THEN** Runtime 从 `todo:stable` 的 `uiDir/assets/` 目录返回对应静态文件

#### Scenario: APP UI Schema 接口
- **WHEN** 客户端请求 `GET /stable/apps/todo/ui.json`
- **THEN** Runtime 返回 `todo:stable` 的 UI Schema JSON，包含页面定义和组件配置

#### Scenario: APP UI 无需 Admin 即可运行
- **WHEN** APP UI 在浏览器中直接加载（非 iframe）
- **THEN** APP UI 正常渲染所有页面，功能完整，不依赖 Admin SPA 的任何上下文

### Requirement: iframe 嵌入协议

Admin SPA SHALL 通过 iframe 嵌入 APP UI，并通过 `window.postMessage` 进行双向通信。

#### Scenario: Admin 嵌入 APP UI
- **WHEN** 用户在 Admin 中访问 `/apps/todo/tasks`
- **THEN** Admin 渲染 `<iframe src="/stable/apps/todo/"></iframe>`，APP UI 在 iframe 内独立运行

#### Scenario: Admin 向 APP 传递认证 Token
- **WHEN** Admin 加载 APP iframe
- **THEN** Admin 通过 `postMessage({ type: 'auth-token', payload: '<token>' })` 将当前用户的认证 token 传递给 APP UI

#### Scenario: Admin 向 APP 传递导航指令
- **WHEN** 用户在 Admin 侧边栏点击 APP 的某个页面
- **THEN** Admin 通过 `postMessage({ type: 'navigate', payload: { pageId: 'tasks' } })` 通知 APP UI 切换页面

#### Scenario: APP 向 Admin 通知标题变更
- **WHEN** APP UI 内部页面切换导致标题变化
- **THEN** APP UI 通过 `postMessage({ type: 'title-changed', payload: '待办事项' })` 通知 Admin 更新标题栏

#### Scenario: APP 向 Admin 通知导航变更
- **WHEN** APP UI 内部发生了页面导航
- **THEN** APP UI 通过 `postMessage({ type: 'navigation-changed', payload: 'tasks' })` 通知 Admin 更新侧边栏高亮

#### Scenario: APP 向 Admin 请求调整高度
- **WHEN** APP UI 内容高度发生变化
- **THEN** APP UI 通过 `postMessage({ type: 'resize', payload: { height: 800 } })` 通知 Admin 调整 iframe 高度

### Requirement: 主题同步机制

Admin SHALL 通过 postMessage 向 APP iframe 传递主题配置，APP UI 使用共享的 CSS Variables 保持视觉一致性。

#### Scenario: 初始主题同步
- **WHEN** Admin 首次加载 APP iframe
- **THEN** Admin 通过 `postMessage({ type: 'theme-update', payload: themeConfig })` 将当前主题传递给 APP UI

#### Scenario: 主题切换同步
- **WHEN** 用户在 Admin 中切换主题（如从 light 切换到 dark）
- **THEN** Admin 通过 `postMessage({ type: 'theme-update', payload: newThemeConfig })` 通知 APP UI 更新主题

#### Scenario: APP UI 应用主题
- **WHEN** APP UI 收到 `theme-update` 消息
- **THEN** APP UI 更新根元素的 CSS Variables，页面样式随之更新，与 Admin 保持视觉一致

#### Scenario: APP 独立访问时使用默认主题
- **WHEN** APP UI 直接在浏览器中访问（非 iframe 嵌入）
- **THEN** APP UI 使用内置的默认主题配置渲染

### Requirement: postMessage 安全

APP UI 和 Admin SHALL 验证 postMessage 来源，防止跨域消息注入。

#### Scenario: 验证消息来源
- **WHEN** APP iframe 收到 postMessage 事件
- **THEN** APP UI 检查 `event.origin` 是否与预期的 Admin 域名匹配，不匹配则忽略消息

#### Scenario: 忽略未知消息类型
- **WHEN** APP iframe 收到未知 `type` 的 postMessage
- **THEN** APP UI 忽略该消息，不产生副作用

### Requirement: APP UI 构建产物

每个 APP 的 UI 构建产物 SHALL 包含完整的运行所需文件，由 Daemon 在 Reconcile/Publish 时生成到对应目录。

#### Scenario: UI 构建产物结构
- **WHEN** Daemon 完成 APP 的 Reconcile 或 Publish
- **THEN** `uiDir` 目录下包含 `index.html`、`assets/` 目录（JS/CSS bundle）和 `ui.json`（UI Schema）

#### Scenario: SchemaRenderer 打包
- **WHEN** UI 构建执行
- **THEN** `@cozybase/ui` 的 SchemaRenderer 及其依赖被打包到 `assets/` 中，APP UI 无需额外加载外部依赖
