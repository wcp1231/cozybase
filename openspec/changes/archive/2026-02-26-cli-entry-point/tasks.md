## 1. 创建 CLI 入口

- [x] 1.1 创建 `packages/server/src/cli.ts`，包含 shebang 行 `#!/usr/bin/env bun`
- [x] 1.2 实现子命令路由：解析第一个 positional 参数，分发到 `daemon` / `mcp` / `--help` / `--version`
- [x] 1.3 实现帮助信息输出（包含版本号、项目描述、子命令列表、全局选项）
- [x] 1.4 实现版本号显示（从 `package.json` 读取 `version` 字段）
- [x] 1.5 未识别子命令时显示帮助信息并以非零退出码退出

## 2. 注册 bin 和更新 scripts

- [x] 2.1 在 `packages/server/package.json` 添加 `"bin": { "cozybase": "./src/cli.ts" }`
- [x] 2.2 更新根 `package.json` 的 scripts，添加使用 CLI 入口的便捷命令

## 3. 基础验证

- [x] 3.1 执行 `bun install` 确认 bin 链接正确生成
- [x] 3.2 验证 `bun run cozybase --help` 正常输出帮助信息
- [x] 3.3 验证 `bun run cozybase --version` 正常输出版本号
- [x] 3.4 验证 `cozybase daemon` 正常启动 HTTP 服务
- [x] 3.5 验证 `cozybase daemon --port 8080` 参数传递正确
- [x] 3.6 验证 `cozybase mcp` 正常启动 MCP Server

## 4. daemon 进程管理

- [x] 4.1 创建 `packages/server/src/daemon-ctl.ts`，实现 `getWorkspaceDir()`、`readPidFile()`、`isProcessAlive()` 工具函数
- [x] 4.2 在 `daemon-ctl.ts` 实现 `daemonStatus()` 函数（读取 PID/port 文件，检测进程存活，输出状态）
- [x] 4.3 在 `daemon-ctl.ts` 实现 `stopDaemon()` 函数（读取 PID 文件，发送 SIGTERM，等待退出）
- [x] 4.4 修改 `index.ts`，daemon 启动后写入 `daemon.pid` 和 `daemon.port`，退出时清理
- [x] 4.5 更新 `cli.ts` 的 daemon 分支，路由到 start/stop/restart/status 子命令
- [x] 4.6 更新 `cli.ts` 帮助信息，包含 daemon 子命令说明

## 5. daemon 子命令验证

- [x] 5.1 验证 `cozybase daemon start` 正常启动并生成 PID 文件
- [x] 5.2 验证 `cozybase daemon status` 在 daemon 运行时显示正确信息
- [x] 5.3 验证 `cozybase daemon stop` 正常停止 daemon 并清理 PID 文件
- [x] 5.4 验证 `cozybase daemon status` 在 daemon 停止后显示 "not running"
- [x] 5.5 验证 `cozybase daemon restart` 正常重启
- [x] 5.6 验证 `cozybase daemon`（无子命令）等同于 start
