## Why

当前 cozybase 的 Daemon 和 APP 运行时逻辑耦合在同一个包（`packages/server`）中：Management API、Reconciler、Function 执行、DB CRUD、UI 渲染全部混在一起。这带来两个问题：

1. **技术栈锁定**：如果未来 Daemon 从 Bun/TypeScript 迁移到 Rust/Zig，无法清晰区分「哪些逻辑需要重写」和「哪些逻辑可以保留」，因为代码边界模糊。
2. **职责不清**：管理逻辑（APP 生命周期、用户认证、Reconcile/Publish）和执行逻辑（Functions 运行、DB 查询、UI 渲染）混在一起，增加了理解和维护的复杂度。

需要将 Daemon 和 APP Runtime 拆分为两个独立的包，明确各自的职责边界和通信接口。当前阶段两者仍在同一个 Bun 进程中运行，但接口设计为标准 HTTP 路由，确保未来可以零成本拆分为独立进程。

## What Changes

- **拆分 `packages/server` 为 `packages/daemon` + `packages/runtime`**：
  - `daemon`：管理层，负责 APP 生命周期管理、用户认证、Reconcile/Publish、Admin SPA serving、MCP Server
  - `runtime`：执行层，负责 APP Functions 执行、DB CRUD、UI serving
- **定义 Daemon ↔ Runtime 接口**：Runtime 暴露标准 Hono HTTP handler，Daemon 在同进程内 mount；未来可改为 HTTP proxy 实现进程分离
- **定义 Runtime → Daemon 回调接口**：Runtime 在需要时向 Daemon 请求认证信息等管理数据
- **APP UI 独立化**：每个 APP 自带完整 UI，Admin 通过 iframe 嵌入
- **移除 DirectRuntime**：函数执行逻辑统一迁移到 runtime 包
- **Workspace 依赖管理**：采用 Bun Workspace 模式支持 APP 安装第三方 npm 依赖

## Capabilities

### New Capabilities

- `app-runtime`: Runtime 包的运行规范，定义 HTTP 路由结构、对外接口、与 Daemon 的通信协议
- `app-ui-independent`: APP UI 独立运行规范，iframe 嵌入协议、主题同步机制

### Modified Capabilities

- `management-api`: 管理 API 留在 daemon，运行时 API 移至 runtime
- `function-runtime`: 从 daemon 内的 DirectRuntime 迁移到 runtime 包
- `ui-renderer`: SchemaRenderer 从 Admin 内嵌变为 APP 独立 UI
- `admin-shell`: APP 页面从直接渲染变为 iframe 嵌入
- `workspace-management`: 新增 Bun Workspace 配置

## Impact

- **代码组织**：`packages/server` 拆分为 `packages/daemon` + `packages/runtime`，大部分是代码搬迁
- **运行方式不变**：当前阶段仍为单一 Bun 进程，daemon mount runtime 的 Hono app
- **Admin SPA 变更**：APP 页面从直接渲染变为 iframe 嵌入
- **依赖管理**：workspace 根目录新增 `package.json`，支持 APP 安装第三方依赖
- **未来迁移路径**：Daemon 重写时，只需将 mount 改为 HTTP proxy，runtime 独立启动
