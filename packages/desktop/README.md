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

构建后对 `.app` 做 ad-hoc signing，并额外产出适合 CI 上传的 `.app.tar.gz`：

```bash
bun run desktop:build:adhoc
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

## Nightly 发布

仓库配置了一个 GitHub Actions nightly workflow：

- 每次 `main` 分支更新时自动执行
- 复用 `bun run desktop:build` 构建桌面 bundle
- 将 DMG 发布到固定的 GitHub prerelease：`nightly`
- 每次都覆盖同一个 asset：`CozyBase_nightly_aarch64.dmg`

当前 nightly 约束：

- 仅产出 macOS Apple Silicon (`arm64`) 的 DMG
- nightly 版本仍沿用应用当前内部版本号，nightly 身份由 release/tag 表达
- 仍然没有签名、公证和自动更新能力

## Nightly 包“已损坏”排查

当前 nightly 构建产物属于 unsigned / unnotarized macOS 应用。用户从浏览器或 GitHub 下载后，macOS Gatekeeper 可能会提示“已损坏”或直接阻止打开。

先在测试机上对下载后的 `.app` 或 `.dmg` 执行以下检查：

```bash
xattr -lr /path/to/CozyBase.app
spctl -a -vv /path/to/CozyBase.app
codesign --verify --deep --strict --verbose=4 /path/to/CozyBase.app
codesign -dv --verbose=4 /path/to/CozyBase.app
```

重点看这几类结果：

- `xattr` 中存在 `com.apple.quarantine`：说明是下载后被 Gatekeeper 标记，nightly 首先按 quarantine 拦截处理。
- `spctl` 显示 rejected、not notarized、developer cannot be verified 或 source=no usable signature：说明这是当前 unsigned nightly 的预期限制，不是应用代码损坏。
- `codesign --verify` 失败并出现 modified、invalid 或 a sealed resource is missing：优先怀疑 CI 上传、二次压缩或下载过程破坏了包体。
- `codesign -dv` 没有有效 Authority / TeamIdentifier：说明当前产物没有正式签名，这是仓库现状。

### 内部测试临时绕过

内部测试以 `.app` 为单位处理，不要直接在挂载的 `.dmg` 内运行。

1. 先把 `CozyBase.app` 从 `.dmg` 拖到 `/Applications` 或本地目录。
2. 移除 quarantine：

   ```bash
   xattr -dr com.apple.quarantine /path/to/CozyBase.app
   ```

3. 重新双击启动。
4. 如果仍被阻止，使用 Finder 右键 `Open` 再确认一次。

不要使用 `spctl --master-disable` 之类的系统级全局绕过。

### 如何区分“未公证”还是“包体被破坏”

如果内部绕过后应用可以正常启动，问题基本可判定为 unsigned / unnotarized nightly 的正常 Gatekeeper 行为。

如果移除 quarantine 后依然无法启动，继续检查以下几项：

- 比较构建机原始产物和从 GitHub 下载回来的产物：

  ```bash
  shasum -a 256 /path/to/original.dmg
  shasum -a 256 /path/to/downloaded.dmg
  ```

- 比较 `.app` 内关键文件是否完整，尤其是：
  - `Contents/MacOS/*`
  - `Contents/Resources/binaries/bun-*`
  - `Contents/Resources/web/**/*`
- 再次执行：

  ```bash
  codesign --verify --deep --strict --verbose=4 /path/to/CozyBase.app
  ```

如果原始产物可通过校验、下载产物失败，根因通常在 CI artifact/release 打包链路，而不是桌面应用本身。

### CI / Release 分发注意事项

当前仓库内没有提交 GitHub Actions workflow 文件；如果 nightly 由外部 CI 配置生成，需要在实际 workflow 中确认以下几点：

- 构建后可以直接调用：

  ```bash
  bun run desktop:build:adhoc
  ```

  这会执行 Tauri build，然后对 `src-tauri/target/release/bundle/macos/*.app` 做 ad-hoc signing，并产出同目录下的 `.app.tar.gz`。
- 优先直接发布 Tauri 原生输出的 `.dmg`，或使用 `.app.tar.gz`。
- 不要在 CI 里对 `.app` 再做一次通用 `zip` 压缩。
- 上传前后都保留 SHA256，便于比对构建机原始产物和下载产物。
- 如果产物解包后无法运行，优先检查 sidecar Bun 二进制是否保留执行位。

只有在需要对外正式分发时，才应继续补 Apple Developer 签名和 notarization 流程。

### Ad-hoc signing 脚本

仓库内已提供以下命令：

```bash
bun run desktop:sign:adhoc
bun run desktop:package:nightly
```

- `desktop:sign:adhoc`：对默认 Tauri 输出目录中的 `.app` 做 ad-hoc signing 并执行 `codesign --verify`。
- `desktop:package:nightly`：在 ad-hoc signing 之后，额外生成 `.app.tar.gz` 供 nightly 上传。

如需手动指定 `.app` 路径，可在 `packages/desktop` 下执行：

```bash
bun run sign:adhoc -- --app /path/to/CozyBase.app --archive
```

这个脚本只解决包体签名一致性问题，不会移除用户机器下载后的 `com.apple.quarantine`，也不能替代 notarization。

