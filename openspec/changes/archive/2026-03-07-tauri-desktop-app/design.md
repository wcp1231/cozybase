## Context

CozyBase 当前以 Daemon + 浏览器的模式运行：

```
Browser (localhost:3030)  ──HTTP/WS──▶  Daemon (Bun, localhost:3000)
                                         ├─ Hono HTTP Server
                                         ├─ WebSocket (agent/chat)
                                         ├─ Runtime (动态 import 用户 app)
                                         ├─ SQLite (bun:sqlite)
                                         └─ Workspace (~/.cozybase)
```

Daemon 通过 PID file (`~/.cozybase/daemon.pid`) 和 port file (`~/.cozybase/daemon.port`) 管理进程状态。Daemon 深度依赖 Bun 运行时（bun:sqlite、Bun.serve、Bun.spawn、动态 import），无法编译为 single-file executable。

## Goals / Non-Goals

**Goals:**
- 提供 macOS 桌面原生体验：系统托盘、单实例、通知
- Tauri 作为薄壳，Daemon 仍为核心服务，架构职责清晰
- 通过 Sidecar 嵌入 Bun，用户零依赖安装即用
- 退出时同步关闭 Daemon，生命周期由 Tauri 统一管理

**Non-Goals:**
- 不支持 Windows / Linux（MVP 仅 macOS）
- 不内嵌前端产物到 WebView（直接加载 Daemon HTTP）
- 不支持多 workspace 切换
- 不实现自动更新（tauri-plugin-updater 后续再做）
- 不改变 Daemon 核心架构，仅做最小适配

## Decisions

### D1: 项目结构 — 独立 `packages/desktop` 包

```
packages/desktop/
├── package.json            # tauri CLI 依赖
├── src-tauri/
│   ├── Cargo.toml          # Rust 依赖
│   ├── tauri.conf.json     # Tauri 配置
│   ├── capabilities/       # Tauri v2 权限声明
│   ├── icons/              # 应用图标
│   └── src/
│       ├── lib.rs          # Tauri 插件注册、setup
│       ├── tray.rs         # 系统托盘
│       └── daemon.rs       # Daemon 进程管理
└── src/
    └── index.html          # 最小 HTML，JS 重定向到 Daemon URL
```

**理由**: 与现有 monorepo 结构一致，不侵入其他包。`src/index.html` 仅作为 Tauri 启动时的 loading 页面，WebView 在 Daemon 就绪后导航到 `http://localhost:{port}`。

**备选方案**: 将 Tauri 配置放在项目根目录。否决，因为会污染根目录，且与 monorepo 包结构不一致。

### D2: Sidecar 嵌入 Bun — 通过 tauri-plugin-shell

Tauri v2 的 sidecar 机制要求二进制文件放置在 `src-tauri/binaries/` 下，并以 `{name}-{target_triple}` 格式命名：

```
src-tauri/binaries/
└── bun-aarch64-apple-darwin      # macOS ARM64
```

Tauri 打包时自动将其嵌入 app bundle 的 `Contents/MacOS/` 目录。

**Daemon 启动方式**: Rust 侧通过 `tauri_plugin_shell::ShellExt` 的 `sidecar()` API 启动 Daemon：

```
app.shell().sidecar("bun")
    .args(["packages/daemon/src/cli.ts", "daemon"])
```

但这里有一个关键问题 — **Daemon 源码不会打包进 app bundle**。

### D3: Daemon 打包策略 — Bun bundler 预打包

在 Tauri 构建前，先用 `bun build` 将 Daemon 打包为单个 JS bundle：

```bash
bun build packages/daemon/src/cli.ts \
  --outdir packages/desktop/src-tauri/resources \
  --target bun \
  --external bun:sqlite
```

产物放入 `src-tauri/resources/`，Tauri 自动嵌入 app bundle 的 `Contents/Resources/` 目录。

Sidecar 启动改为：

```
app.shell().sidecar("bun")
    .args([resource_path("daemon.js"), "daemon", "--workspace", workspace_dir])
```

**注意**: Runtime 的动态 `import()` 加载用户 app 函数不受影响，因为用户 app 文件在 `~/.cozybase/` workspace 中，不需要打包进 bundle。

**Web 前端资源**: Daemon 的 Hono 服务已经负责提供 Web 前端静态文件，所以 Vite 构建产物也需要作为 resource 打包进去，由 Daemon 在运行时提供服务。

### D4: Bun 路径适配 — 环境变量 `COZYBASE_BUN_PATH`

当前 `draft-reconciler.ts` 和 `publisher.ts` 中硬编码了 `Bun.spawn(['bun', 'install'])`。Sidecar 场景下，bun 二进制在 app bundle 内，不在系统 PATH 中。

**方案**: 引入 `COZYBASE_BUN_PATH` 环境变量。Tauri 启动 Daemon 时设置此变量指向 sidecar bun 路径。Daemon 代码中统一使用 `process.env.COZYBASE_BUN_PATH ?? 'bun'` 获取 bun 可执行文件路径。

影响文件：
- `packages/daemon/src/core/draft-reconciler.ts` (line 335)
- `packages/daemon/src/core/publisher.ts` (line 279)

### D5: Daemon 生命周期管理

```
Tauri 启动
    │
    ├─ 1. 读取 ~/.cozybase/daemon.pid + daemon.port
    │      ├─ 进程存在且健康 → 直接使用该 port
    │      └─ 不存在或已死 → 启动 sidecar bun
    │
    ├─ 2. 启动 Daemon sidecar
    │      ├─ 设置 COZYBASE_BUN_PATH 指向 sidecar bun
    │      ├─ 设置 COZYBASE_WORKSPACE=~/.cozybase
    │      └─ 轮询 daemon.port 文件出现 (最多 15s)
    │
    ├─ 3. 健康检查: GET http://localhost:{port}/health
    │      ├─ 成功 → WebView 导航到 http://localhost:{port}
    │      └─ 失败 → 重试，超时后显示错误
    │
    ├─ 4. 运行中: 定期健康检查 (每 10s)
    │      ├─ 健康 → 托盘图标绿色
    │      └─ 异常 → 托盘图标红色 + 通知
    │
    └─ 5. 退出: 用户点 Quit 或关闭窗口
           ├─ 向 Daemon 发送 SIGTERM
           ├─ 等待最多 5s 优雅关闭
           ├─ 超时则 SIGKILL
           └─ 清理 PID/port 文件
```

**复用现有机制**: Daemon 的 `writePidFile`/`cleanupPidFile`/`isProcessAlive` 逻辑在 Rust 侧用原生 fs/signal 重新实现，协议完全一致（读取同一个 PID file）。

### D6: WebView 加载策略 — Loading 页 + 重定向

```
Tauri 窗口创建
    │
    ├─ 初始加载 index.html (内嵌 loading UI)
    │   "正在启动 CozyBase..."
    │
    ├─ Rust 侧 Daemon 就绪后
    │   通过 Tauri event 通知前端
    │
    └─ JS 收到事件 → window.location = "http://localhost:{port}"
```

**理由**: 避免 WebView 在 Daemon 未就绪时显示白屏或错误页。Loading 页面是纯静态 HTML，不依赖任何构建工具。

**CSP 配置**: `tauri.conf.json` 中需要允许 WebView 访问 `http://localhost:*`，包括 HTTP 和 WebSocket 协议。

### D7: 系统托盘

托盘菜单结构：

| 菜单项 | 行为 |
|--------|------|
| Open CozyBase | 显示/聚焦主窗口 |
| --- | 分隔线 |
| Daemon: Running / Stopped | 状态显示（不可点击） |
| Restart Daemon | 停止后重新启动 Daemon |
| --- | 分隔线 |
| Quit | 关闭 Daemon + 退出应用 |

托盘图标根据 Daemon 状态切换（健康/异常两种图标）。

**窗口关闭行为**: 点击窗口关闭按钮时**不退出应用**，而是隐藏窗口。应用继续在托盘常驻。只有点击 Quit 菜单项才真正退出。

### D8: 单实例 — tauri-plugin-single-instance

使用 Tauri 官方 `tauri-plugin-single-instance` 插件。当第二个实例启动时：
1. 检测到已有实例
2. 通知已有实例（已有实例聚焦窗口）
3. 第二个实例退出

无需自行实现 socket lock 或 file lock。

### D9: 构建流程

```
开发阶段 (日常):
  bun run dev  →  Daemon + Vite dev server (不涉及 Tauri)

Tauri 开发调试:
  cd packages/desktop
  cargo tauri dev  →  启动 Tauri 窗口 + Daemon sidecar

打包发布:
  1. bun run build:web          # Vite 构建前端
  2. bun build daemon bundle    # 打包 Daemon 为单文件 JS
  3. 下载 bun 二进制到 src-tauri/binaries/
  4. cargo tauri build           # 生成 .dmg
```

根 `package.json` 新增脚本：

```json
{
  "scripts": {
    "desktop:dev": "cd packages/desktop && cargo tauri dev",
    "desktop:build": "bun run build:web && bun run build:daemon && cd packages/desktop && cargo tauri build"
  }
}
```

## Risks / Trade-offs

**[包体大小 ~60MB]** → Bun sidecar ~50MB + Tauri ~10MB。对桌面应用可接受，但显著大于纯 Web 方案。后续可考虑 Bun 压缩或按需下载。

**[Bun 版本锁定]** → Sidecar 嵌入固定版本的 Bun，更新需要重新发布应用。→ 在 `tauri.conf.json` 和构建脚本中明确记录 Bun 版本，CI 中自动下载指定版本。

**[Daemon bundle 兼容性]** → `bun build` 打包 Daemon 为单文件可能遇到动态 import、Node.js built-in 等问题。→ 需要 spike 验证 `bun build --target bun` 对当前 Daemon 代码的兼容性。如果不可行，备选方案是将整个 `packages/daemon` + `node_modules` 打包为 resource 目录。

**[macOS 签名和公证]** → 未签名的 app 需要用户手动绕过 Gatekeeper。→ MVP 阶段接受这个限制，后续申请 Apple Developer 账号。

**[localhost 安全策略]** → WebView 访问 localhost 在 macOS 上通常无限制，但未来 macOS 版本可能收紧。→ 监控 Tauri 社区对此问题的讨论。

**[Daemon 启动时序]** → Daemon 启动可能需要数秒（SQLite 初始化、app 加载），期间 WebView 需要等待。→ Loading 页面 + 超时错误处理覆盖此场景。
