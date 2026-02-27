## MODIFIED Requirements

### Requirement: Workspace 目录结构扩展

Workspace 目录结构 SHALL 扩展以支持 Runtime 包和 APP npm 依赖。

#### Scenario: 新增 Runtime 相关目录
- **WHEN** Workspace 初始化
- **THEN** 除现有目录外，`data/apps/{appName}/` 和 `draft/apps/{appName}/` 目录均包含：
  - `db.sqlite` — APP 数据库
  - `functions/` — 函数文件目录
  - `ui/` — UI 构建产物目录（`index.html`、`assets/`、`ui.json`）

#### Scenario: Bun Workspace 配置
- **WHEN** Workspace 初始化
- **THEN** Workspace 根目录包含 `package.json`，配置 Bun Workspace：
  ```json
  {
    "workspaces": ["packages/*", "data/apps/*"]
  }
  ```
- **AND** 公共依赖（如 `react`、`@cozybase/ui`）提升到 Workspace 根目录的 `node_modules/`

### Requirement: APP npm 依赖支持

每个 APP SHALL 可以声明自己的 npm 依赖，通过 Bun Workspace 机制管理。

#### Scenario: APP 声明特有依赖
- **WHEN** APP 目录下存在 `package.json` 声明了额外依赖
- **THEN** 执行 `bun install` 在 Workspace 根目录时，APP 特有依赖安装到 APP 自身的 `node_modules/` 或提升到根目录

#### Scenario: 公共依赖共享
- **WHEN** 多个 APP 使用相同版本的公共依赖（如 `@cozybase/ui`）
- **THEN** 该依赖仅在 Workspace 根目录的 `node_modules/` 中安装一份

#### Scenario: APP 函数模块解析
- **WHEN** Runtime 加载 APP 函数并且函数 import 了第三方依赖
- **THEN** 模块解析按标准 Node 解析算法，先查找 APP 自身的 `node_modules/`，再向上查找 Workspace 根目录的 `node_modules/`

### Requirement: Workspace 初始化流程扩展

Workspace 自动初始化流程 SHALL 扩展为包含 Runtime 创建和 APP 启动步骤。

#### Scenario: 初始化流程
- **WHEN** Daemon 首次启动并初始化 Workspace
- **THEN** 执行以下步骤：
  1. 创建目录结构
  2. 初始化 Platform DB
  3. 加载模板应用
  4. 创建 Runtime 实例（`createRuntime()`），获取 `{ app, registry }`
  5. Mount Runtime 到 Daemon 路由（`app.route('/', runtimeApp)`）
  6. 遍历 APP 列表，对每个 APP 调用 `registry.start(name, config)` 启动
  7. `await startup` 完成后开始接受外部请求

### Requirement: packages 结构变更

`packages/` 目录 SHALL 新增 `runtime` 包，原 `server` 包重构为 `daemon` 包。

#### Scenario: 包结构
- **WHEN** 查看 packages 目录
- **THEN** 包含以下包：
  - `packages/daemon` — 管理层（原 `packages/server` 重构）
  - `packages/runtime` — 执行层（新增）
  - `packages/admin` — Admin SPA（保留，移除 SchemaRenderer 渲染逻辑）
  - `packages/ui` — SchemaRenderer 组件库（保留，作为 npm 包供 APP UI 打包）

#### Scenario: 包间依赖关系
- **WHEN** 构建项目
- **THEN** 依赖关系为：
  - `daemon` → `runtime`（import `createRuntime`）
  - `admin` → 无直接代码依赖（通过 HTTP 与 daemon 通信）
  - `runtime` → `ui` 无直接依赖（`ui` 由 APP 构建时打包）
