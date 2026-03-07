# CozyBase Desktop

CozyBase Desktop 是一个基于 Tauri 的 macOS 桌面壳。它不内嵌 Web 前端，而是在启动时准备资源目录、复制 Bun sidecar、拉起打包后的 Daemon bundle，然后让 WebView 连接到本地 Daemon 服务。

## 当前范围

- 仅支持 macOS
- Bun 运行时通过 `src-tauri/resources/binaries/bun-{target}` 内嵌
- Web 静态资源、Daemon bundle、guides、templates 都打包进 `src-tauri/resources/`
- 默认 workspace 为 `~/.cozybase`

## 开发依赖

- Bun
- Rust toolchain
- Xcode Command Line Tools
- Tauri CLI（已通过 `@tauri-apps/cli` 作为 workspace devDependency 引入）

## 常用命令

在仓库根目录执行：

```bash
bun run build:web
bun run build:daemon
bun run desktop:dev
```

或直接一次性执行：

```bash
bun run desktop:dev
```

构建 DMG / app bundle：

```bash
bun run desktop:build
```

## 资源准备

`bun run build:daemon` 会执行两步：

1. `packages/desktop/scripts/build-resources.ts`
   - 生成 `src-tauri/resources/daemon.js`
   - 复制 `packages/web/dist` 到 `src-tauri/resources/web`
   - 复制 `packages/daemon/guides` 和 `packages/daemon/templates`
2. `packages/desktop/scripts/prepare-sidecar.ts`
   - 默认复制当前环境里的 Bun 可执行文件
   - 输出到 `src-tauri/resources/binaries/bun-{target}`

可通过环境变量覆盖 sidecar 来源：

```bash
COZYBASE_BUN_SOURCE=/path/to/custom/bun bun run build:daemon
```

若需要显式指定 target triple：

```bash
COZYBASE_BUN_TARGET=x86_64-apple-darwin bun run build:daemon
```

## Desktop 运行时环境变量

Tauri 壳启动 Daemon bundle 时会注入：

- `COZYBASE_BUN_PATH`
- `COZYBASE_WORKSPACE`
- `COZYBASE_RESOURCE_DIR`
- `COZYBASE_DAEMON_ENTRY`
- `COZYBASE_WEB_DIST_DIR`
- `COZYBASE_GUIDES_DIR`
- `COZYBASE_TEMPLATES_DIR`

这些变量让同一个 Daemon bundle 同时兼容本地源码运行和桌面 bundle 运行。

## 已知限制

- 当前没有做自动更新
- 当前没有做 macOS 签名与公证
- 在受限沙箱环境里，`Bun.serve` 可能无法完成端口监听，因此桌面 runtime 验收最好在真实 macOS 开发环境中执行
