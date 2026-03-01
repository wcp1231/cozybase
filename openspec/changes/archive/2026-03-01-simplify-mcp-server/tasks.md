## 1. 简化 `mcp-entry.ts`

- [x] 1.1 修改 `createBackend()` 函数：移除 embedded fallback 分支（第 82-113 行），替换为 `console.error` 输出错误信息 + `process.exit(1)`
- [x] 1.2 移除 `createBackend()` 返回值中的 `cleanup` 字段（RemoteBackend 无需 cleanup），同步简化 `main()` 中的 `cleanup()` 调用和 SIGINT/SIGTERM handler
- [x] 1.3 移除文件顶部对 `../server` 的描述注释（embedded 模式相关说明）
- [x] 1.4 更新文件顶部的模块文档注释，去掉 "Falls back to embedded mode" 的描述

## 2. 删除废弃文件

- [x] 2.1 删除 `packages/daemon/src/mcp/embedded-backend.ts`
- [x] 2.2 删除 `packages/daemon/src/mcp/sql-safety.ts`

## 3. 更新注释与类型

- [x] 3.1 更新 `packages/daemon/src/mcp/types.ts` 顶部注释，去掉 "embedded vs remote" 的描述，改为说明 MCP Server 通过 HTTP 连接 daemon

## 4. 验证

- [x] 4.1 确认 TypeScript 编译无错误（无残留的 import 引用）
- [x] 4.2 确认 MCP Server 在 daemon 运行时能正常启动并连接
- [x] 4.3 确认 MCP Server 在 daemon 未运行时输出正确的错误信息并退出
