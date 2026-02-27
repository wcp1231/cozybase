## MODIFIED Requirements

### Requirement: SchemaRenderer 独立打包

SchemaRenderer SHALL 作为 `@cozybase/ui` npm 包发布，供每个 APP 的 UI 构建时打包使用，而非嵌入在 Admin SPA 中。

#### Scenario: APP UI 打包 SchemaRenderer
- **WHEN** APP 的 UI 构建执行
- **THEN** 构建工具将 `@cozybase/ui` 的 SchemaRenderer 及其依赖（React、组件库等）打包到 APP 的 `assets/` 目录中

#### Scenario: SchemaRenderer 在 APP iframe 中运行
- **WHEN** APP UI 在浏览器中加载（无论是独立访问还是 iframe 嵌入）
- **THEN** SchemaRenderer 从 APP 自身的 bundle 中加载运行，不依赖 Admin SPA 的 SchemaRenderer 实例

### Requirement: PageContext baseUrl 变更

PageContext 的 `baseUrl` SHALL 指向 APP 自身的 Runtime 路由，而非 Admin 的 API 代理。

#### Scenario: baseUrl 指向 Runtime
- **WHEN** SchemaRenderer 在 APP UI 中初始化
- **THEN** `baseUrl` 设置为 APP 自身的 Runtime 前缀（如 `/stable/apps/todo`），API 调用直接发往 Runtime 路由

#### Scenario: API 请求路由
- **WHEN** ActionDispatcher 执行 `api` 类型的 action
- **THEN** 请求发往 `{baseUrl}/fn/{fnName}` 或 `{baseUrl}/db/{table}`，由 Runtime 处理

### Requirement: 主题支持

SchemaRenderer SHALL 支持通过 CSS Variables 接收主题配置，以便在 iframe 嵌入时与 Admin 保持视觉一致。

#### Scenario: 接收 postMessage 主题更新
- **WHEN** APP UI 运行在 iframe 中，收到 Admin 发送的 `theme-update` postMessage
- **THEN** SchemaRenderer 更新根元素的 CSS Variables，所有使用 CSS Variables 的组件样式自动更新

#### Scenario: 默认主题
- **WHEN** APP UI 独立运行（非 iframe）
- **THEN** SchemaRenderer 使用内置的默认主题 CSS Variables 渲染
