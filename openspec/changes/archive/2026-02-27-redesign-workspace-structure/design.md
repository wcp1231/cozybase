## Context

当前 workspace 结构（`data/apps/{name}/`、`draft/apps/{name}/`）将 stable 和 draft 数据混合在两个顶层目录下，每个 app 目录不是完整的 Node.js 包。这导致：

1. 函数代码无法 `import` 第三方 npm 包——没有 `package.json`，没有 `node_modules`
2. 路径结构中 `data/apps/` 的嵌套让 stable 和 draft 的对称性不够清晰
3. `platform.sqlite` 藏在 `data/` 下，与 app 数据目录并列，语义混乱

改造目标：将每个 mode（stable/draft）下的 app 目录变成完整的独立包单元，支持各自安装和使用 npm 依赖。

受影响的现有代码：`workspace.ts`、`publisher.ts`、`draft-reconciler.ts`、`server.ts`。

## Goals / Non-Goals

**Goals:**
- 新目录结构：`stable/{name}/` 和 `draft/{name}/` 各为完整 Node.js 包目录
- `platform.sqlite` 提升到 workspace 根目录
- `package.json` 作为 app file 存储在 `app_files` 表
- publish/reconcile 后自动运行 `bun install` 安装 app 依赖
- Bun 动态 import 时能正确解析 app 自身的 `node_modules`（覆盖新旧路径）

**Non-Goals:**
- 不使用 Bun Workspace 共享 `node_modules`——各 app 完全独立，避免版本冲突
- 不支持跨 app 共享依赖
- 不对 `package.json` 内容做语义验证（如依赖版本合法性）
- 不在 `bun install` 失败时阻断 publish/reconcile（依赖安装失败不影响核心流程）

## Decisions

### 决策 1：不使用 Bun Workspace，各 app 独立管理 `node_modules`

**结论**：每个 `stable/{name}/` 和 `draft/{name}/` 各自有 `node_modules/`，互相隔离。

**理由**：
- APP 是用户创建的，不同 APP 可能依赖同一包的不同版本
- Bun Workspace 的依赖提升策略会导致隐性版本冲突，调试困难
- Bun 的模块解析是基于被 import 文件的路径向上查找，单进程同时运行多个 app 时各自能找到自己的 `node_modules`

**放弃的方案**：Bun Workspace（`workspaces: ["apps/*"]`）——共享 `node_modules` 节省磁盘，但换来的是依赖隔离性差。

```
~/.cozybase/
  stable/
    appA/
      node_modules/   ← appA 自己的依赖
    appB/
      node_modules/   ← appB 自己的依赖（可与 appA 版本不同）
```

### 决策 2：`package.json` 作为普通 app file（存在 `app_files` 表）

**结论**：`package.json` 在 `app_files` 表中以 `path = "package.json"` 存储，与函数文件、migration 文件同等对待。

**理由**：
- 复用现有的文件管理基础设施（版本、导出逻辑）
- `package.json` 随 `current_version` 版本变更，依赖声明属于 app 状态的一部分
- 模板 `package.json` 可直接放在 `packages/daemon/templates/` 下，无需额外处理

**导出时机**：
- `reconcile` 时：将 `package.json` 导出到 `draft/{name}/package.json`，然后执行 `bun install`
- `publish` 时：将 `package.json` 导出到 `stable/{name}/package.json`，然后执行 `bun install`

### 决策 3：`bun install` 以子进程方式运行，失败不阻断主流程

**结论**：在 `package.json` 导出后，在 app 目录运行 `Bun.spawn(['bun', 'install'])` 并 await，失败时记录 warning 但不抛出错误。

**理由**：
- `bun install` 是增量幂等操作，有 lockfile 缓存时几乎瞬间完成
- 依赖安装失败（如网络问题）不应阻断 migration 执行和函数导出——函数执行时若真的缺少依赖，runtime 会报运行时错误
- 在 app 目录而非 workspace 根目录运行 `bun install`，确保依赖安装到对应的 `node_modules/`

```
export package.json → bun install（cwd: stable/{name}/）→ 记录结果（不抛错）
```

### 决策 4：新目录结构

```
~/.cozybase/
  workspace.yaml
  platform.sqlite         ← 从 data/ 提升到根目录
  stable/                 ← stable 运行时（原 data/）
    {appName}/
      package.json        ← app file，publish 后导出
      node_modules/       ← publish 后 bun install
      db.sqlite
      functions/
      ui/
  draft/                  ← draft 运行时（结构不变，路径简化）
    {appName}/
      package.json        ← app file，reconcile 后导出
      node_modules/       ← reconcile 后 bun install
      db.sqlite
      functions/
      ui/
```

路径变更对照：

| 旧路径 | 新路径 |
|--------|--------|
| `data/platform.sqlite` | `platform.sqlite` |
| `data/apps/{name}/db.sqlite` | `stable/{name}/db.sqlite` |
| `data/apps/{name}/functions/` | `stable/{name}/functions/` |
| `data/apps/{name}/ui/` | `stable/{name}/ui/` |
| `draft/apps/{name}/db.sqlite` | `draft/{name}/db.sqlite` |
| `draft/apps/{name}/functions/` | `draft/{name}/functions/` |
| `draft/apps/{name}/ui/` | `draft/{name}/ui/` |

## Risks / Trade-offs

**[Risk] `bun install` 耗时影响 reconcile/publish 响应时间**
→ Mitigation：`bun install` 有 lockfile 缓存，二次安装几乎是瞬间完成。首次或依赖变更时可能需要几秒，可接受。未来可优化为仅在 `package.json` hash 变化时才重新安装。

**[Risk] `node_modules` 占用磁盘空间翻倍（stable + draft 各一份）**
→ Mitigation：draft 的 `node_modules` 可以在 bun install 时通过 symlink 引用 stable 的，但复杂度增加。MVP 阶段接受重复安装，后续可优化。

**[Risk] `app_files` 中没有 `package.json` 记录的旧版 app**
→ Mitigation：导出 `package.json` 时若无记录则跳过，缺少 `package.json` 的 app 不能使用 npm 依赖，但核心功能（functions、db）不受影响。模板中添加默认 `package.json`。

## Open Questions

- 模板 `package.json` 的默认内容是什么？至少应包含 `name`、`version`，是否预装任何依赖？
- draft 的 `node_modules` 是否可以复用（或 symlink）stable 的，以节省磁盘？MVP 先搁置。
