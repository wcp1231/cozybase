## 1. Desktop 包与构建骨架

- [x] 1.1 创建 `packages/desktop` 包结构，补齐 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/` 和 `src/index.html`
- [x] 1.2 在根 `package.json` 中新增 `desktop:dev`、`desktop:build`、`build:daemon` 等脚本，并串联 Web 构建、Daemon bundle 和 Tauri 构建流程
- [x] 1.3 实现将 `packages/daemon/src/cli.ts` 打包到 `packages/desktop/src-tauri/resources/` 的构建步骤，并确保 Web 静态资源也能作为 desktop resources 一起产出
- [x] 1.4 为 `src-tauri/binaries/` 增加 Bun sidecar 准备流程或脚本，明确目标文件命名与 Bun 版本来源

## 2. Daemon 运行时适配

- [x] 2.1 修改 `packages/daemon/src/core/draft-reconciler.ts` 和 `packages/daemon/src/core/publisher.ts`，统一通过 `process.env.COZYBASE_BUN_PATH ?? 'bun'` 解析 Bun 可执行文件
- [x] 2.2 梳理 Daemon 启动参数与环境变量读取逻辑，确保 desktop 模式下 `COZYBASE_WORKSPACE` 或等效 workspace 参数能驱动 `daemon.pid`、`daemon.port` 的读写路径
- [x] 2.3 验证 `bun build --target bun` 生成的 Daemon bundle 可正常启动，并处理构建过程中对 `bun:sqlite` 等外部依赖的兼容配置

## 3. Tauri 启动与 Daemon 生命周期

- [x] 3.1 在 Tauri Rust 侧实现默认 workspace 解析与自动创建逻辑，保证首次启动时会准备 `~/.cozybase` 及所需基础目录
- [x] 3.2 实现对现有 `daemon.pid`、`daemon.port` 和 `/health` 的检查逻辑，优先复用健康的 Daemon，避免重复启动
- [x] 3.3 实现通过 Bun sidecar 启动 Daemon bundle 的流程，并在启动时注入 `COZYBASE_BUN_PATH` 与 workspace 上下文
- [x] 3.4 实现 Daemon 的轮询、健康检查、异常通知、托盘重启以及应用退出时的优雅关闭与超时强杀

## 4. Desktop Shell 交互

- [x] 4.1 实现 loading 页面与 Tauri event 通信，在 Daemon 就绪后将窗口跳转到 `http://localhost:{port}`，并提供启动失败时的错误提示
- [x] 4.2 配置 WebView 对 `http://localhost:*` 和相关 WebSocket 连接的访问能力，确保桌面壳可稳定加载现有 Web 应用
- [x] 4.3 实现系统托盘菜单、状态图标和关闭窗口仅隐藏不退出的行为
- [x] 4.4 集成 `tauri-plugin-single-instance` 与通知能力，确保第二个实例拉起已有窗口且关键事件可触发 macOS 原生通知

## 5. 验证与发布准备

- [x] 5.1 在 macOS 上验证 `desktop:dev` 与 `desktop:build` 流程，包括未预装 Bun 时通过 sidecar 启动的场景
- [x] 5.2 验证托盘打开/隐藏、Daemon 自动拉起、Daemon 重启、Quit 关闭 Daemon、单实例聚焦等核心场景
- [x] 5.3 补充 desktop 开发与打包说明，记录 Bun sidecar 准备方式、Rust/Tauri 依赖以及当前仅支持 macOS 的限制
