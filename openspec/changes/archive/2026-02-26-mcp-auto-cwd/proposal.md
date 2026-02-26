## Why

当前 `cozybase mcp` 的 `--apps-dir` 默认值是 `~/.cozybase/apps`，用户在不同项目目录启动 Coding Agent 时，MCP Server 总是将文件同步到同一个固定位置。给 Agent 配置 MCP 启动命令是固定的（如 Claude Code 的 `mcp_servers` 配置），无法动态传入当前目录。将默认值改为 `process.cwd()`，让 MCP Server 自动使用 Agent 的当前工作目录。

## What Changes

- **BREAKING** `cozybase mcp` 的 `--apps-dir` 默认值从 `~/.cozybase/apps` 改为 `process.cwd()`
- 显式传入 `--apps-dir` 或设置 `COZYBASE_APPS_DIR` 环境变量的行为不受影响

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `mcp-tools`: "Agent 工作目录管理" requirement 的默认 appsDir 行为变更

## Impact

- 修改文件：`packages/server/src/mcp/mcp-entry.ts`（修改 `loadMcpConfig()` 中 appsDir 的默认值）
- **BREAKING**：已有用户如果依赖默认的 `~/.cozybase/apps` 路径，升级后 appsDir 会变为 CWD，需要显式传 `--apps-dir ~/.cozybase/apps` 恢复旧行为
