## ADDED Requirements

### Requirement: Admin SPA 路由结构

Admin SHALL 作为单页应用（SPA），提供以下路由结构：

| 路由 | 说明 |
|------|------|
| `/` | 首页，重定向到 App 列表或默认 App |
| `/apps` | App 列表页 |
| `/apps/:appName` | App 详情页，重定向到 App 的第一个 UI 页面 |
| `/apps/:appName/:pageId` | App 的具体 UI 页面 |

Admin 的所有路由 SHALL 在客户端处理（client-side routing），Server 对于未匹配的非 API 路径 SHALL 返回 `index.html`（SPA fallback）。

#### Scenario: 访问 App 页面

- **WHEN** 用户访问 `/apps/welcome/todo-list`
- **THEN** Admin SHALL 加载 `welcome` App 的 UI 定义，渲染 id 为 `todo-list` 的页面

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

Admin SHALL 在进入 App 页面时加载该 App 的 `ui/pages.json` 文件，并传递给 `SchemaRenderer` 渲染。

加载流程：
1. 调用 `GET /api/v1/apps/:appName` 获取 App 完整信息
2. 从 files 中找到 `ui/pages.json` 文件的内容
3. 解析 JSON，提取 `pages` 和 `components`
4. 根据当前路由的 `pageId` 找到对应的 `PageSchema`
5. 构造 `baseUrl`（`/stable/apps/:appName`），传给 `SchemaRenderer`

加载过程中 SHALL 显示 loading 状态。加载失败 SHALL 显示错误信息。

#### Scenario: 正常加载 App UI

- **WHEN** 进入 `/apps/welcome/todo-list`
- **THEN** Admin SHALL 加载 `welcome` 的 `ui/pages.json`，找到 `todo-list` 页面，构造 baseUrl 为 `/stable/apps/welcome`，渲染 SchemaRenderer

#### Scenario: 页面不存在

- **WHEN** 进入 `/apps/welcome/nonexistent`，但 pages.json 中没有 id 为 `nonexistent` 的页面
- **THEN** Admin SHALL 显示 "页面不存在" 的错误提示

#### Scenario: JSON 解析失败

- **WHEN** `ui/pages.json` 内容不是合法 JSON
- **THEN** Admin SHALL 显示 "UI 定义解析失败" 的错误信息

### Requirement: Admin 导航布局

Admin SHALL 提供基础导航布局，包含：

**侧边栏**：
- 显示当前 App 的所有页面列表（来自 `pages.json` 的 pages 数组）
- 当前页面高亮
- 可点击切换页面
- 在 App 列表页时显示 App 列表

**顶部栏**：
- 显示当前 App 名称和页面标题
- 返回 App 列表的入口

#### Scenario: 多页面 App 导航

- **WHEN** App 有 3 个页面：首页、设置、关于
- **THEN** 侧边栏 SHALL 显示这 3 个页面的标题，点击可切换

#### Scenario: 单页面 App

- **WHEN** App 只有 1 个页面
- **THEN** 侧边栏 SHALL 仍显示该页面，但可折叠或简化

### Requirement: Server 静态文件 Serve

`packages/server` 的 Hono 应用 SHALL 配置静态文件中间件，serve `packages/admin` 的 build 产物。

静态文件路由规则：
- API 路由（`/api/*`、`/stable/*`、`/draft/*`）优先匹配
- 静态文件（`.js`、`.css`、`.html`、`.ico` 等）从 admin build 目录 serve
- 其他未匹配路径 SHALL 返回 `index.html`（SPA fallback）

#### Scenario: serve 静态资源

- **WHEN** 浏览器请求 `/assets/index.js`
- **THEN** Server SHALL 从 admin build 目录返回对应的 JS 文件

#### Scenario: SPA fallback

- **WHEN** 浏览器请求 `/apps/welcome/todo-list`（非 API 路径、非静态文件）
- **THEN** Server SHALL 返回 `index.html`，由 Admin 的客户端路由处理

#### Scenario: API 路由优先

- **WHEN** 浏览器请求 `/api/v1/apps`
- **THEN** Server SHALL 匹配 API 路由处理，不走静态文件逻辑

### Requirement: 构建流程

monorepo 的构建 SHALL 按以下顺序执行：

1. `packages/ui` → build 为 ESM 库（输出到 `packages/ui/dist/`）
2. `packages/admin` → build 为静态 SPA（输出到 `packages/admin/dist/`），依赖 `@cozybase/ui`
3. `packages/server` → build 时将 `packages/admin/dist/` 嵌入

`packages/admin` 的 `package.json` SHALL 声明对 `@cozybase/ui` 的 workspace 依赖。

开发模式下，`packages/admin` SHALL 可独立启动 dev server（如 Vite），通过代理将 API 请求转发到 `packages/server`。

#### Scenario: 完整构建

- **WHEN** 执行项目构建命令
- **THEN** 系统 SHALL 按 ui → admin → server 顺序构建，最终产物中包含 admin 的静态文件

#### Scenario: 开发模式

- **WHEN** 开发者启动 admin dev server
- **THEN** admin SHALL 在独立端口运行，API 请求代理到运行中的 server 进程
