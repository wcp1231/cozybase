## 1. 修改默认值

- [x] 1.1 修改 `packages/server/src/mcp/mcp-entry.ts` 中 `loadMcpConfig()` 的 appsDir 默认值，从 `resolve(homedir(), '.cozybase', 'apps')` 改为 `process.cwd()`

## 2. 验证

- [x] 2.1 验证 `cozybase mcp` 未传 `--apps-dir` 时 appsDir 为 CWD
- [x] 2.2 验证 `cozybase mcp --apps-dir /tmp/test-apps` 显式传参仍然生效
