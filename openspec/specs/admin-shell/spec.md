# Admin Shell

## Purpose

Define the Admin SPA behavior for routing, app list and app view rendering, iframe embedding of APP UI, navigation synchronization, static file serving, and build/runtime integration with daemon and runtime packages.
## Requirements
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

### Requirement: App 列表页

Admin SHALL 提供 App 列表页，显示所有可用的 App。

列表 SHALL 通过调用 Server 的 `GET /api/v1/apps` 获取数据，显示每个 App 的：
- 名称
- 描述
- 状态（draft_only / stable / stable_draft）
- 是否有 UI 定义

点击 App SHALL 导航到该 App 的 UI 页面。无 UI 的 App 仍需可见但标注为"无 UI"。

#### Scenario: 列出所有 App

- **WHEN** 用户访问 `/apps`
- **THEN** Admin SHALL 请求 API 并显示所有 App 的列表，含状态信息

#### Scenario: 点击进入 App

- **WHEN** 用户点击列表中的 `welcome` App
- **THEN** Admin SHALL 导航到 `/apps/welcome`

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

### Requirement: Server 静态文件 Serve

Admin SPA 的静态文件 serve SHALL 保留在 Daemon 中，APP 的 UI 静态文件 serve 迁移到 Runtime。

#### Scenario: Daemon serve Admin SPA

- **WHEN** 客户端请求 `/admin/*` 或未匹配 API 路由的路径
- **THEN** Daemon 返回 Admin SPA 的静态文件，SPA fallback 逻辑不变

#### Scenario: Runtime serve APP UI

- **WHEN** 客户端请求 `/stable/apps/:name/` 或 `/stable/apps/:name/assets/*`
- **THEN** 请求经 Daemon mount 到达 Runtime，Runtime 从 APP 注册表条目的 `uiDir` serve 静态文件

#### Scenario: API 路由优先

- **WHEN** 浏览器请求 `/api/v1/apps`
- **THEN** Server SHALL 匹配 API 路由处理，不走静态文件逻辑

### Requirement: 构建流程

构建顺序 SHALL 调整为 `ui → admin → runtime → daemon`，新增 `packages/runtime` 的构建步骤。

monorepo 的构建 SHALL 按以下顺序执行：

1. `packages/ui` → build 为 ESM 库（输出到 `packages/ui/dist/`）— SchemaRenderer 组件库
2. `packages/admin` → build 为静态 SPA（输出到 `packages/admin/dist/`），依赖 `@cozybase/ui`
3. `packages/runtime` → APP Runtime
4. `packages/daemon` → Daemon（依赖 runtime）

`packages/admin` 的 `package.json` SHALL 声明对 `@cozybase/ui` 的 workspace 依赖。

开发模式下，`packages/admin` SHALL 可独立启动 dev server（如 Vite），通过代理将 API 请求转发到 `packages/daemon`。

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

#### Scenario: 开发模式

- **WHEN** 开发者启动 admin dev server
- **THEN** admin SHALL 在独立端口运行，API 请求代理到运行中的 daemon 进程

