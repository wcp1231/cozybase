## Context

`mcp-entry.ts` 中 `loadMcpConfig()` 的 appsDir 默认值为 `~/.cozybase/apps`。这是一个固定路径，不会随 Coding Agent 的工作目录变化。用户在 Agent 的 MCP 配置中写的是固定启动命令，无法动态注入 `--apps-dir`。

## Goals / Non-Goals

**Goals:**

- 让 `cozybase mcp` 在未指定 `--apps-dir` 时默认使用 `process.cwd()` 作为 appsDir

**Non-Goals:**

- 不改变 `--apps-dir` 或 `COZYBASE_APPS_DIR` 显式指定时的行为
- 不改变 appsDir 的使用方式（仍然是 `{appsDir}/{appName}/` 结构）

## Decisions

### 1. 默认值从 `~/.cozybase/apps` 改为 `process.cwd()`

**决定**：修改 `loadMcpConfig()` 中 appsDir 的 fallback 链，将最后的默认值从 `resolve(homedir(), '.cozybase', 'apps')` 改为 `process.cwd()`。

**理由**：MCP Server 启动时的 CWD 就是 Coding Agent 的工作目录。Agent 配置是固定命令，不能动态传参，但 CWD 是自然随 Agent 启动位置变化的。

**优先级链不变**：`--apps-dir` > `COZYBASE_APPS_DIR` > `process.cwd()`

## Risks / Trade-offs

- **BREAKING 变更** → 已有用户如果依赖默认路径 `~/.cozybase/apps`，升级后行为会改变。缓解：在文档和 CHANGELOG 中说明，需要显式传 `--apps-dir ~/.cozybase/apps` 恢复旧行为。
