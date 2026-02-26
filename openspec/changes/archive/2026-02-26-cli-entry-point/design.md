## Context

当前 cozybase 有两个独立入口：`packages/server/src/index.ts`（HTTP daemon）和 `packages/server/src/mcp/mcp-entry.ts`（MCP Server）。用户需要知道具体文件路径才能启动服务，没有统一的命令行界面。

两个入口都使用 `util.parseArgs` 解析参数，且均配置了 `strict: false` + `allowPositionals: true`，这意味着额外的 positional 参数（如子命令名）会被自动忽略。

## Goals / Non-Goals

**Goals:**

- 提供统一的 `cozybase <command>` CLI 入口
- 支持 `daemon` 和 `mcp` 两个子命令
- `daemon` 支持 `start`、`stop`、`restart`、`status` 子命令，实现完整的进程生命周期管理
- 支持 `--help` 和 `--version` 顶层选项
- 在项目内通过 `bun run cozybase` 即可使用

**Non-Goals:**

- 不引入外部 CLI 框架（Commander.js、yargs 等）
- 不支持 npm 全局安装
- 不做后台 daemon 化（start 始终在前台运行）
- 不增加 `init`、`app` 等管理子命令（后续阶段）

## Decisions

### 1. 纯动态 import 路由，不修改现有入口

**决定**：`cli.ts` 通过 `await import("./index")` 和 `await import("./mcp/mcp-entry")` 转发到现有模块，不修改 `index.ts` 和 `mcp-entry.ts` 的逻辑。

**理由**：两个入口的 `parseArgs` 都用了 `allowPositionals: true`，子命令名（如 "daemon"）会被当作 positional 参数忽略，`--port`、`--workspace` 等选项照常解析。零改动意味着零风险。

**备选方案**：将 `index.ts` 和 `mcp-entry.ts` 重构为导出函数再由 `cli.ts` 调用。虽然更 "干净"，但增加了改动范围和引入 bug 的可能性，收益不大。

### 2. bin 注册在 `packages/server/package.json`

**决定**：在 `packages/server/package.json` 添加 `"bin": { "cozybase": "./src/cli.ts" }`。

**理由**：CLI 代码和 server 代码在同一个包内。Root scripts 通过 `bun packages/server/src/cli.ts` 直接调用（Bun workspace 不自动链接 `.bin`）。

### 3. 版本号从 package.json 读取

**决定**：`cli.ts` 在运行时读取 `packages/server/package.json` 的 `version` 字段，避免硬编码。

**理由**：保持版本号单一来源真相。`index.ts` 中 banner 的硬编码版本号可以后续统一，但不在本次改动范围内。

### 4. 使用 Bun 原生能力，不用 CLI 框架

**决定**：直接使用 `process.argv` 和简单的 switch/case 分发，不引入任何第三方 CLI 库。

**理由**：命令结构简单，手写代码可控，引入框架反而增加了依赖和复杂度。

### 5. PID 文件实现 daemon 进程管理

**决定**：daemon 启动时在 workspace 目录写入 `daemon.pid`（进程 PID）和 `daemon.port`（监听端口），进程退出时自动清理。`stop`/`status`/`restart` 通过读取这些文件来定位和管理 daemon 进程。

**理由**：PID 文件是 Unix 下进程管理的标准方式，简单可靠，零依赖。

**文件位置**：`{workspaceDir}/daemon.pid` 和 `{workspaceDir}/daemon.port`（默认 `~/.cozybase/`）。

**备选方案**：通过 HTTP health endpoint 探测。需要知道端口号，而且无法区分 "我们的 daemon" 和 "其他进程占用了该端口"。PID 文件更可靠。

### 6. daemon 管理逻辑独立为 `daemon-ctl.ts`

**决定**：将 `status`、`stop` 等管理逻辑放在独立的 `daemon-ctl.ts` 文件中，`cli.ts` 负责路由。

**理由**：保持 `cli.ts` 简洁（纯路由），管理逻辑集中在一个位置便于维护。

## Risks / Trade-offs

- **PID 文件残留** → 如果进程被 `kill -9` 强杀，PID 文件不会被清理。`status` 命令通过 `process.kill(pid, 0)` 检测进程是否存活来应对此情况。
- **多实例冲突** → 如果用不同端口启动多个 daemon，PID 文件会被覆盖。当前阶段只支持单实例，多实例属于后续扩展。
- **子命令参数冲突** → 由于使用 `strict: false`，如果未来子命令参数与顶层选项重名，可能产生歧义。当前阶段顶层只有 `--help`/`--version`，不会冲突。
