## Context

当前 MCP Server（`packages/daemon/src/mcp/mcp-entry.ts`）有两种 backend 模式：

- **RemoteBackend**: 通过 HTTP 连接到运行中的 daemon 进程
- **EmbeddedBackend**: 在 MCP 进程内启动完整 cozybase server（Workspace、AppManager、Registry 等）

模式选择逻辑：`--url` 参数 → 自动检测 PID 文件 → fallback 到 embedded。

但 MCP Server 在 stdio 配置下始终是独立进程，embedded 模式引入了 SQLite 并发访问风险，且增加了不必要的代码复杂度。

## Goals / Non-Goals

**Goals:**

- 移除 EmbeddedBackend，MCP Server 始终作为 daemon 的 HTTP 客户端
- daemon 未运行时给出清晰的错误提示
- 保持 `CozybaseBackend` 接口和所有 MCP tool handlers 不变
- 清理不再被引用的 `embedded-backend.ts` 和 `sql-safety.ts`

**Non-Goals:**

- 不实现 MCP Server 自动启动 daemon 的能力（后续考虑）
- 不引入 MCP 连接的认证机制（后续 MVP 之后考虑）
- 不修改 RemoteBackend 的实现逻辑

## Decisions

### Decision 1: 移除 EmbeddedBackend，不保留 fallback

**选择**: daemon 未运行时直接报错退出。

**替代方案**:
- 自动启动 daemon 进程 — 增加复杂度，进程生命周期管理不易
- 启动临时 daemon（MCP 退出时关闭）— 本质上仍是 embedded 的变体

**理由**: MVP 阶段保持简单。用户必须先启动 daemon，这是一个合理的前置条件。错误信息会告知用户如何操作。

### Decision 2: `createBackend()` 简化为两条路径

```
createBackend()
  ├─ --url 提供?     → RemoteBackend(url)
  ├─ PID 文件检测到?  → RemoteBackend(http://127.0.0.1:{port})
  └─ else            → throw Error(提示信息)
```

保留现有的 `readPidFile()` + `isProcessAlive()` 自动检测逻辑不变，仅去掉第 82-113 行的 embedded fallback 分支。

### Decision 3: 错误信息设计

报错信息需要同时告知问题和解决方案：

```
No running cozybase daemon detected.

To use cozybase MCP, either:
  1. Start the daemon:  cozybase daemon start
  2. Specify a remote daemon URL:  cozybase mcp --url http://host:port
```

通过 `process.exit(1)` 退出（而非 throw），因为此时 MCP transport 尚未建立，throw 的 error 不会被 MCP 客户端看到。用 `console.error` 输出到 stderr 确保信息可见。

### Decision 4: 清理 `sql-safety.ts`

`sql-safety.ts` 仅被 `embedded-backend.ts` 引用。daemon 侧的 SQL 安全校验由 HTTP 路由层或 runtime 独立处理。删除 `embedded-backend.ts` 后，`sql-safety.ts` 成为死代码，一并清理。

### Decision 5: `types.ts` 注释更新

`CozybaseBackend` 接口保持不变。仅更新文件顶部的注释，去掉 "embedded vs remote" 的描述，改为说明 MCP Server 通过 HTTP 连接 daemon。

## Risks / Trade-offs

- **[用户体验变化]** 之前不需要 daemon 也能用 MCP，现在必须先启动 → 通过清晰的错误信息引导用户操作来缓解
- **[功能回退]** 离线/无 daemon 场景不再支持 → 当前 MVP 阶段可接受，后续可实现自动启动 daemon 的能力
- **[不可逆删除]** 删除 `embedded-backend.ts` 后恢复需要从 git 历史取回 → 代码在 git 中，风险极低
