## Why

目前启动 cozybase 需要直接 `bun run packages/server/src/index.ts` 或 `bun run src/mcp/mcp-entry.ts`，用户必须了解内部文件结构才能使用。需要一个统一的 CLI 入口来包装这些命令，提供 `cozybase daemon` / `cozybase mcp` 等子命令形式，提升使用体验。

## What Changes

- 新增 CLI 路由入口 `packages/server/src/cli.ts`，作为所有子命令的分发器
- 支持 `cozybase daemon` 子命令及其子命令：
  - `cozybase daemon start` / `cozybase daemon` — 启动 HTTP 服务，写 PID 文件
  - `cozybase daemon stop` — 读取 PID 文件，停止运行中的 daemon
  - `cozybase daemon restart` — 停止后重新启动
  - `cozybase daemon status` — 查看 daemon 运行状态
- 支持 `cozybase mcp` 子命令启动 MCP Server（转发到现有 `mcp-entry.ts`）
- 支持 `cozybase --help` / `cozybase --version` 顶层选项
- 在 `packages/server/package.json` 注册 `bin` 字段，使 `cozybase` 命令在项目内可用
- 更新根 `package.json` 的 scripts 使用新的 CLI 入口

## Capabilities

### New Capabilities

- `cli-entry`: 统一 CLI 入口，支持子命令路由、帮助信息和版本显示

### Modified Capabilities

（无）

## Impact

- 新增文件：`packages/server/src/cli.ts`、`packages/server/src/daemon-ctl.ts`
- 修改文件：`packages/server/src/index.ts`（写入/清理 PID 文件）、`packages/server/package.json`（新增 `bin` 字段）、`package.json`（更新 scripts）
- 不影响任何现有 API 或功能行为
