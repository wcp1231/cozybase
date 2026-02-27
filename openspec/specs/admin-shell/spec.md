# Admin Shell

## Purpose

Define the Admin SPA behavior for routing, app list and app view rendering, iframe embedding of APP UI, navigation synchronization, static file serving, and build/runtime integration with daemon and runtime packages.

## Requirements

### Requirement: Admin SPA 路由结构

Admin SHALL 作为单页应用（SPA），提供以下路由结构：

| 路由 | 说明 |
|------|------|
| `/` | 首页，重定向到 App 列表或默认 App |
| `/apps` | App 列表页 |
| `/apps/:appName` | App 详情页，重定向到 App 的第一个 UI 页面 |
| `/apps/:appName/:pageId` | App 的具体 UI 页面 |

Admin 的所有路由 SHALL 在客户端处理（client-side routing），Server 对于未匹配的非 API 路径 SHALL 返回 `index.html`（SPA fallback）。APP 视图页面从直接渲染 SchemaRenderer 变为通过 iframe 嵌入 APP UI。

#### Scenario: APP 页面路由

- **WHEN** 用户访问 `/apps/:appName/:pageId`
- **THEN** Admin 渲染 iframe 容器，设置 `src` 为 APP 的 Runtime UI 地址（`/stable/apps/:appName/`），而非直接在 Admin 内渲染 SchemaRenderer

#### Scenario: APP 列表页不变

- **WHEN** 用户访问 `/apps`
- **THEN** Admin 仍通过 `GET /api/v1/apps` 获取 APP 列表并渲染，逻辑不变

#### Scenario: 访问 App 默认页面

- **WHEN** 用户访问 `/apps/welcome`，welcome App 的第一个页面为 `todo-list`
- **THEN** Admin SHALL 重定向到 `/apps/welcome/todo-list`

#### Scenario: App 无 UI

- **WHEN** 用户访问 `/apps/my-app`，但 `my-app` 没有 `ui/pages.json`
- **THEN** Admin SHALL 显示 "该 App 暂无 UI 界面" 的空状态提示

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

Admin SHALL 通过 iframe 加载 APP UI，不再直接调用 SchemaRenderer。iframe 与 APP UI 的 postMessage 协议（如 `auth-token`、`theme-update`、`navigate` 等）SHALL 遵循 `app-ui-independent` capability 定义。

#### Scenario: iframe 加载 APP UI

- **WHEN** 用户在 Admin 中选择某个 APP
- **THEN** Admin 创建 `<iframe src="/stable/apps/:appName/"></iframe>`
- **AND** iframe 加载 APP 自身的完整 UI（包含 SchemaRenderer、UI Schema 和所有静态资源）

#### Scenario: iframe 加载状态

- **WHEN** iframe 正在加载 APP UI
- **THEN** Admin 显示 loading 状态
- **AND** iframe 的 `onload` 事件触发后，Admin SHALL 按 `app-ui-independent` 协议发送初始化消息

#### Scenario: iframe 加载失败

- **WHEN** APP UI 加载失败（如 APP 未启动或不存在）
- **THEN** Admin 显示错误提示信息

#### Scenario: 页面不存在

- **WHEN** 进入 `/apps/welcome/nonexistent`，但 pages.json 中没有 id 为 `nonexistent` 的页面
- **THEN** Admin SHALL 显示 "页面不存在" 的错误提示

### Requirement: Admin 导航布局

Admin 导航布局 SHALL 通过 postMessage 与 iframe 中的 APP UI 同步页面导航和标题。
消息类型、payload 结构与来源校验 SHALL 遵循 `app-ui-independent`，本 Requirement 仅定义 Admin 侧可见行为和状态变化。

**侧边栏**：
- 显示当前 App 的所有页面列表（通过 `GET /stable/apps/:appName/ui.json` 获取）
- 当前页面高亮
- 可点击切换页面（通过 postMessage 通知 iframe）
- 在 App 列表页时显示 App 列表

**顶部栏**：
- 显示当前 App 名称和页面标题
- 返回 App 列表的入口

#### Scenario: 侧边栏页面列表

- **WHEN** Admin 加载 APP 视图
- **THEN** Admin 通过 `GET /stable/apps/:appName/ui.json` 获取 APP 的页面列表，在侧边栏显示

#### Scenario: 侧边栏页面切换

- **WHEN** 用户在 Admin 侧边栏点击某个页面
- **THEN** Admin 通过协议定义的导航消息通知 iframe 中的 APP UI 切换页面

#### Scenario: APP 通知页面变更

- **WHEN** APP UI 在 iframe 内部发生页面切换
- **THEN** APP UI 通过协议定义的导航变更消息通知 Admin
- **AND** Admin 更新侧边栏的高亮状态和顶部栏标题

#### Scenario: 多页面 App 导航

- **WHEN** App 有 3 个页面：首页、设置、关于
- **THEN** 侧边栏 SHALL 显示这 3 个页面的标题，点击可切换

#### Scenario: 单页面 App

- **WHEN** App 只有 1 个页面
- **THEN** 侧边栏 SHALL 仍显示该页面，但可折叠或简化

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
