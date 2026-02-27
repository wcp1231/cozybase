## 1. workspace.ts：路径常量与初始化

- [x] 1.1 将 `dataDir`（`data/`）重命名为 `stableDir`（`stable/`），更新所有引用
- [x] 1.2 将 `platform.sqlite` 路径从 `data/platform.sqlite` 改为 workspace 根目录 `platform.sqlite`
- [x] 1.3 更新 `init()`：创建 `stable/` 和 `draft/` 目录（移除 `data/` 和 `data/apps/` 的创建逻辑）
- [x] 1.4 更新 `getOrCreateApp()` 和 `appDataDir()` 等方法，返回新路径 `stable/{appName}/`
- [x] 1.5 移除 workspace 根目录 `package.json` 的创建逻辑（若有）

## 2. 模板文件：添加默认 package.json

- [x] 2.1 在 `packages/daemon/templates/welcome/` 目录下新增 `package.json`，内容仅含 `name`（值为 `welcome`）和 `version`（值为 `1.0.0`）

## 3. publisher.ts：路径更新

- [x] 3.1 将所有 `data/apps/{appName}/` 路径替换为 `stable/{appName}/`（db.sqlite、functions/、ui/）
- [x] 3.2 将 `db.sqlite.bak` 备份路径更新为 `stable/{appName}/db.sqlite.bak`

## 4. publisher.ts：package.json 导出与 bun install

- [x] 4.1 在函数文件导出后，检查 `app_files` 中是否存在 `path = "package.json"` 的记录
- [x] 4.2 若存在，将其内容写出到 `stable/{appName}/package.json`
- [x] 4.3 在 `stable/{appName}/` 目录运行 `bun install`（使用 `Bun.spawn` 或等效方式）
- [x] 4.4 `bun install` 失败时记录 warning，不抛出错误，不阻断 publish 主流程
- [x] 4.5 在 `PublishResult` 中新增 `npm?: { installed: boolean; warning?: string }` 字段并填充

## 5. draft-reconciler.ts：路径更新

- [x] 5.1 将所有 `draft/apps/{appName}/` 路径替换为 `draft/{appName}/`（db.sqlite、functions/、ui/）

## 6. draft-reconciler.ts：package.json 导出与 bun install

- [x] 6.1 在函数文件导出后，检查 `app_files` 中是否存在 `path = "package.json"` 的记录
- [x] 6.2 若存在，将其内容写出到 `draft/{appName}/package.json`
- [x] 6.3 在 `draft/{appName}/` 目录运行 `bun install`
- [x] 6.4 `bun install` 失败时记录 warning，不阻断 reconcile 主流程
- [x] 6.5 在 `DraftReconcileResult` 中新增 `npm?: { installed: boolean; warning?: string }` 字段并填充

## 7. server.ts：startAppsInRuntime 路径更新

- [x] 7.1 更新 `startAppsInRuntime()` 中 stable 模式的路径构造：`stable/{appName}/db.sqlite`、`stable/{appName}/functions/`、`stable/{appName}/ui/`
- [x] 7.2 更新 draft 模式的路径构造：`draft/{appName}/db.sqlite`、`draft/{appName}/functions/`、`draft/{appName}/ui/`

## 8. 验证

- [x] 8.1 启动 daemon，确认新 workspace 初始化时目录结构符合预期（`stable/`、`draft/`、`platform.sqlite` 在根目录）
- [ ] 8.2 创建新 APP（含 `package.json`），执行 reconcile，确认 `draft/{name}/package.json` 导出且 `bun install` 运行
- [ ] 8.3 执行 publish，确认 `stable/{name}/package.json` 导出且 `bun install` 运行
- [ ] 8.4 在函数中 `import` 一个已声明的 npm 包，确认 Runtime 能正确解析并执行
