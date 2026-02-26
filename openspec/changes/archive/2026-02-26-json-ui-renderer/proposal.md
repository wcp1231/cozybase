## Why

cozybase 后端能力（Auto CRUD API、Custom Functions、MCP 工具）已经就绪，但缺少 UI 层。内部 APP（如 Welcome TODO App）无法向用户提供可视化界面。直接让 Agent 编写 TSX 文件太重且容易出错，需要一种更轻量、结构化的方式来定义和渲染 APP 的 UI，同时便于 Agent 生成和修改。

## What Changes

- 新增 `packages/ui` 包：一个独立的 JSON-to-UI 渲染库，将 JSON schema 映射为 React 组件树
  - 实现递归式 Schema Renderer，通过组件注册表将 `type` 字符串映射到 React 组件
  - 实现 Expression Resolver，解析 `${xxx.yyy}` 表达式（支持组件状态、行数据、表单数据等作用域）
  - 实现 Action Dispatcher，处理声明式 action（`api`、`dialog`、`reload`、`link`、`close`、`confirm`）
  - 实现 PageContext，管理组件状态注册和跨组件引用
  - 实现 MVP 内置组件集：`table`、`form`、`button`、`card`、`dialog`、`tabs` 等约 23 个基础组件
  - 支持 JSON 组合式自定义组件（通过 `components` 声明复用组件模板）
- 新增 `packages/admin` 包：Admin SPA 壳子
  - 提供路由、导航、App 切换等基础框架
  - 加载 App 的 `ui/pages.json` 并传递给 Schema Renderer 进行渲染
  - Build 时打包为静态文件，由 Server 的 Hono 直接 serve
- APP 文件结构新增 `ui/pages.json`，使用 JSON 格式定义页面结构、数据绑定和交互行为
- Agent 通过现有 `update_app_file` MCP 工具操作 `ui/pages.json`，MVP 阶段采用文件级读写

## Capabilities

### New Capabilities

- `ui-schema`: UI JSON DSL 的 TypeScript 类型定义，包括页面、组件、Action、Expression 的 schema 规范
- `ui-renderer`: JSON-to-React 渲染引擎，包括递归渲染器、组件注册表、Expression Resolver、Action Dispatcher 和 PageContext
- `ui-components`: 内置组件库的实现规范，涵盖布局、数据展示、数据输入、操作和反馈五类组件
- `admin-shell`: Admin SPA 壳子的实现规范，包括路由、App 视图加载、静态文件 serve

### Modified Capabilities

- `mcp-tools`: Agent 需要通过 MCP 工具操作 `ui/pages.json`，需要在工具描述中补充 UI 文件相关的指引

## Impact

- **新增 packages**: `packages/ui`（React 库，无 server 依赖）、`packages/admin`（React SPA，依赖 `@cozybase/ui`）
- **Server 变更**: `packages/server` 需要新增静态文件 serve 路由，将 admin build 产物托管在根路径
- **App 文件结构**: `app_files` 表中新增 `ui/pages.json` 文件类型
- **依赖引入**: React、React DOM、React Router（admin）；可能引入 UI 基础库（如 Radix UI / shadcn）
- **构建流程**: monorepo 构建需要先 build `packages/ui`，再 build `packages/admin`，最后将产物嵌入 `packages/server`
