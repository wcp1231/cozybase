## MODIFIED Requirements

### Requirement: Workspace 目录结构

Workspace 目录结构 SHALL 支持每个 APP 模式（stable/draft）作为独立的 Node.js 包目录，包含自己的 `node_modules/`。

系统 SHALL 使用以下固定的目录结构来组织 workspace：

- `workspace.yaml` — workspace 配置文件
- `platform.sqlite` — 平台级数据库（Source of Truth，含 `app_files` 表），位于 workspace 根目录
- `stable/` — Stable 运行时目录，每个已发布 APP 一个子目录
- `stable/{appName}/` — 各 APP 的 Stable 运行时目录（完整 Node.js 包目录）
  - `package.json` — APP 的 npm 依赖声明（从 `app_files` 导出）
  - `node_modules/` — APP 自身的 npm 依赖（publish 后 `bun install` 安装）
  - `db.sqlite` — APP Stable 数据库
  - `functions/` — Stable 函数文件目录（从 `app_files` 导出）
  - `ui/` — Stable UI 构建产物目录（`index.html`、`assets/`、`ui.json`）
- `draft/` — Draft 运行时目录，每个有 Draft 状态的 APP 一个子目录
- `draft/{appName}/` — 各 APP 的 Draft 运行时目录（完整 Node.js 包目录）
  - `package.json` — APP 的 npm 依赖声明（从 `app_files` 导出）
  - `node_modules/` — APP 自身的 npm 依赖（reconcile 后 `bun install` 安装）
  - `db.sqlite` — APP Draft 数据库
  - `functions/` — Draft 函数文件目录（从 `app_files` 导出）
  - `ui/` — Draft UI 构建产物目录

`stable/` 和 `draft/` 的相对路径 SHALL 为硬编码约定，不可通过配置修改。

不使用 Bun Workspace。workspace 根目录 SHALL 不包含 `package.json`。各 APP 目录独立管理自己的 `node_modules/`。

#### Scenario: workspace 目录结构完整性

- **WHEN** workspace 初始化完成后
- **THEN** workspace root 下 SHALL 存在 `workspace.yaml`、`platform.sqlite`、`stable/`、`draft/` 目录。不应存在 `data/`、`apps/`、`package.json`（根目录）

#### Scenario: stable APP 目录结构

- **WHEN** 一个 APP 完成首次 publish 后
- **THEN** `stable/{appName}/` 目录 SHALL 存在，包含 `db.sqlite`、`functions/`、`ui/`；若 `app_files` 中有 `package.json` 记录，SHALL 同时存在 `package.json` 和 `node_modules/`

#### Scenario: draft APP 目录结构

- **WHEN** 一个 APP 完成 reconcile 后
- **THEN** `draft/{appName}/` 目录 SHALL 存在，包含 `db.sqlite`、`functions/`；若 `app_files` 中有 `package.json` 记录，SHALL 同时存在 `package.json` 和 `node_modules/`

#### Scenario: 定义与运行时数据分离

- **WHEN** 一个 APP 的定义文件存储在 `platform.sqlite` 的 `app_files` 表中
- **THEN** 该 APP 的 Stable 运行时数据 SHALL 存放在 `stable/{appName}/` 下，Draft 运行时数据 SHALL 存放在 `draft/{appName}/` 下

## REMOVED Requirements

### Requirement: APP npm 依赖支持

**Reason**: 原设计使用 Bun Workspace 共享 `node_modules`，存在跨 APP 依赖版本冲突风险。改为各 APP 独立管理 `node_modules`，相关规范迁移至 `app-npm-dependencies` capability。

**Migration**: 参见 `openspec/specs/app-npm-dependencies/spec.md`。
