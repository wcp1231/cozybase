## Why

当前 workspace 目录结构（`data/apps/`、`draft/apps/`）无法支持每个 APP 独立管理 npm 依赖——没有 `package.json`，没有 `node_modules`，用户函数无法 `import` 第三方包。重新设计目录结构，将 stable/draft 两种模式下的 APP 作为独立目录单元，为每个 APP 提供完整的 Node.js 包运行环境。

## What Changes

- **BREAKING** workspace 目录结构调整：`data/` 重命名为 `stable/`，`data/apps/{name}/` → `stable/{name}/`，`draft/apps/{name}/` → `draft/{name}/`
- **BREAKING** `platform.sqlite` 路径从 `data/platform.sqlite` 提升到 workspace 根目录 `platform.sqlite`
- 每个 APP 目录（`stable/{name}/` 和 `draft/{name}/`）包含独立的 `package.json` 和 `node_modules/`，作为完整的 Node.js 包环境
- `package.json` 作为 app file 存储在 `app_files` 表中，随 app 版本一起管理
- publish 时导出 `package.json` 到 `stable/{name}/` 后触发 `bun install`
- reconcile 时导出 `package.json` 到 `draft/{name}/` 后触发 `bun install`

## Capabilities

### New Capabilities
- `app-npm-dependencies`: APP 通过 `package.json`（作为 app file）声明 npm 依赖，runtime 在 publish/reconcile 后自动安装，函数代码可 import 第三方包

### Modified Capabilities
- `workspace-management`: 目录结构变更（`data/` → `stable/`，`platform.sqlite` 路径，各 `{mode}/{name}/` 作为独立包目录）
- `reconciler-draft-stable`: reconcile 和 publish 流程新增导出 `package.json` 并执行 `bun install` 的步骤

## Impact

- `packages/daemon/src/core/workspace.ts`：路径常量、`init()`、`load()`
- `packages/daemon/src/core/publisher.ts`：`exportFunctions()`、`exportUi()` 目标路径；新增 `bun install` 步骤
- `packages/daemon/src/core/draft-reconciler.ts`：导出路径；新增 `bun install` 步骤
- `packages/daemon/src/server.ts`：`startAppsInRuntime()` 路径构造
- `packages/runtime/src/registry.ts`：`AppEntry` 路径无代码改动，由调用方传入正确路径
