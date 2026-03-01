## Why

MCP Server 通过 stdio 模式启动时必然是一个独立进程，与 daemon 是否在运行无关。当前的 EmbeddedBackend 模式在 MCP 进程内启动完整 server，会导致两个进程同时持有 SQLite 连接的风险（用户后续启动 daemon 时）。应去掉 remote/embedded 的双模式设计，简化为 MCP Server 始终作为 daemon 的客户端。

## What Changes

- **BREAKING**: 移除 EmbeddedBackend 模式。MCP Server 不再在进程内启动完整 cozybase server。
- **BREAKING**: 当没有运行中的 daemon 且未指定 `--url` 时，MCP Server 报错退出而非自动 fallback 到 embedded 模式。
- 保留现有的自动检测逻辑：读取 `daemon.pid` / `daemon.port` 发现本地 daemon。
- 保留 `--url` 参数：支持连接到远程 daemon。
- 删除 `embedded-backend.ts` 和仅被其引用的 `sql-safety.ts`。
- `CozybaseBackend` 接口保持不变，`RemoteBackend` 作为唯一实现。
- MCP tool handlers 无需任何修改。

## Capabilities

### New Capabilities

无。本次变更是简化，不引入新能力。

### Modified Capabilities

- `cli-entry`: MCP 子命令的行为变更 — 去掉 embedded 模式 fallback，daemon 未运行时报错退出。

## Impact

- **代码**: 删除 `packages/daemon/src/mcp/embedded-backend.ts`（~359 行）、`packages/daemon/src/mcp/sql-safety.ts`
- **代码**: 修改 `packages/daemon/src/mcp/mcp-entry.ts` 中的 `createBackend()` 函数
- **用户体验**: 使用 MCP 前必须先确保 daemon 在运行（`cozybase daemon start`）或提供远程 `--url`
- **依赖**: 无新增依赖；移除对 `../server`（createServer）的动态 import
- **API**: MCP tool 接口不变，对 AI Agent 透明
