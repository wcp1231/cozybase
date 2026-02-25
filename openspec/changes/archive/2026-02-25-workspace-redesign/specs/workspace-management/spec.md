## ADDED Requirements

### Requirement: Workspace 目录结构

系统 SHALL 使用以下固定的目录结构来组织 workspace：

- `workspace.yaml` — workspace 配置文件
- `apps/` — 应用声明目录（git tracked）
- `data/` — 运行时数据目录（git ignored）
- `data/platform.sqlite` — 平台级数据库
- `data/apps/{appName}/` — 各 app 的数据目录

`apps/` 和 `data/` 的相对路径 SHALL 为硬编码约定，不可通过配置修改。

#### Scenario: workspace 目录结构完整性

- **WHEN** workspace 初始化完成后
- **THEN** workspace root 下 SHALL 存在 `workspace.yaml`、`apps/`、`data/` 目录，以及 `.gitignore` 和 `.git/` 目录

#### Scenario: 声明与数据分离

- **WHEN** 用户将应用定义文件放在 `apps/{appName}/` 下
- **THEN** 该 app 的运行时数据（SQLite 数据库、存储文件等）SHALL 存放在 `data/apps/{appName}/` 下，不与声明文件混合

### Requirement: workspace.yaml 配置文件

system SHALL 在 workspace root 下维护一个 `workspace.yaml` 配置文件。MVP 阶段只包含 `name`（字符串）和 `version`（整数，表示 schema version）两个字段。

#### Scenario: 解析有效的 workspace.yaml

- **WHEN** `workspace.yaml` 包含有效的 `name` 和 `version` 字段
- **THEN** 系统 SHALL 成功加载 workspace 配置

#### Scenario: workspace.yaml 缺失

- **WHEN** workspace root 下不存在 `workspace.yaml`
- **THEN** 系统 SHALL 判定该目录为未初始化的 workspace，并执行自动初始化流程

#### Scenario: workspace.yaml schema version 校验

- **WHEN** `workspace.yaml` 的 `version` 字段值为系统支持的版本
- **THEN** 系统 SHALL 正常加载；若为不支持的版本，系统 SHALL 抛出错误并拒绝启动

### Requirement: Workspace 自动初始化

当 workspace 目录不存在或未初始化时，系统 SHALL 自动执行完整初始化流程，无需用户手动干预。

初始化步骤 SHALL 包含：
1. 创建 workspace root 目录（若不存在）
2. 创建 `apps/` 和 `data/` 子目录
3. 写入 `workspace.yaml`（默认 name 为 `"cozybase"`，version 为 `1`）
4. 写入 `.gitignore`（忽略 `data/`、`*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`）
5. 执行 `git init`
6. 创建示例 app：`apps/hello/app.yaml`（内容：`description: "Hello World"`）
7. 执行初始 git commit

#### Scenario: 首次启动自动初始化

- **WHEN** 用户首次启动 server，且 workspace 路径下不存在 `workspace.yaml`
- **THEN** 系统 SHALL 自动完成初始化，创建完整目录结构、示例 app 和初始 git commit

#### Scenario: 已初始化的 workspace 不再重复初始化

- **WHEN** workspace root 下已存在 `workspace.yaml`
- **THEN** 系统 SHALL 跳过初始化流程，直接加载现有配置

#### Scenario: git 不可用时的降级处理

- **WHEN** 系统环境中未安装 git
- **THEN** 初始化 SHALL 跳过 `git init` 和初始 commit 步骤，打印警告信息，其余步骤正常完成

### Requirement: Workspace 默认路径

当用户未通过 `--workspace` 参数或 `COZYBASE_WORKSPACE` 环境变量指定 workspace 路径时，系统 SHALL 使用 `$HOME/.cozybase` 作为默认 workspace 路径。

#### Scenario: 未指定 workspace 路径

- **WHEN** 启动 server 时未传入 `--workspace` 参数且未设置 `COZYBASE_WORKSPACE` 环境变量
- **THEN** 系统 SHALL 使用 `$HOME/.cozybase` 作为 workspace root

#### Scenario: 通过 CLI 指定 workspace 路径

- **WHEN** 启动 server 时传入 `--workspace /path/to/my-workspace`
- **THEN** 系统 SHALL 使用 `/path/to/my-workspace` 作为 workspace root

### Requirement: App 声明扫描

Workspace SHALL 扫描 `apps/` 目录下的所有子目录，发现包含 `app.yaml` 的目录作为有效的 app 声明。

扫描规则：
- app 名称 MUST 匹配 `^[a-zA-Z0-9_-]+$`
- 以 `.` 开头的目录 SHALL 被忽略
- 不包含 `app.yaml` 的目录 SHALL 被忽略

每个 app 目录可包含：
- `app.yaml` — app 元信息声明（必须）
- `tables/*.yaml` — 数据表结构声明
- `functions/*.ts` — 函数源代码（开发者用平台 SDK 编写）

#### Scenario: 扫描到有效 app

- **WHEN** `apps/todo-app/` 目录下存在 `app.yaml`
- **THEN** 系统 SHALL 将 `todo-app` 识别为有效 app，解析其 `app.yaml`、`tables/*.yaml` 和 `functions/*.ts`

#### Scenario: 忽略无效目录

- **WHEN** `apps/` 下存在 `.hidden/` 目录或不包含 `app.yaml` 的 `temp/` 目录
- **THEN** 系统 SHALL 忽略这些目录，不将其视为 app

### Requirement: Git 自动提交

Reconcile 成功后，系统 SHALL 自动执行 git commit，记录 `apps/` 目录的变更历史。

具体行为：
- 执行 `git add apps/` 将声明文件变更加入暂存区
- 自动生成 commit message，包含 reconcile 的变更摘要
- 若 `apps/` 没有实际文件变更，SHALL 跳过 commit
- git 命令失败 SHALL 不阻塞 reconcile 流程，仅打印警告

#### Scenario: reconcile 后自动提交

- **WHEN** reconcile 成功完成且 `apps/` 目录有文件变更
- **THEN** 系统 SHALL 执行 `git add apps/` 和 `git commit`，commit message 包含变更信息

#### Scenario: 无变更时跳过提交

- **WHEN** reconcile 成功完成但 `apps/` 目录没有文件变更
- **THEN** 系统 SHALL 跳过 git commit

#### Scenario: git 命令失败降级

- **WHEN** git commit 或 git add 执行失败（如 git 未安装）
- **THEN** 系统 SHALL 打印警告信息，但 reconcile 结果不受影响

### Requirement: Platform DB 由 Workspace 管理

Workspace SHALL 持有并管理 platform 级别的 SQLite 数据库连接（`data/platform.sqlite`）。

Platform DB 包含以下系统表：`apps`、`platform_users`、`api_keys`、`resource_state`。Schema 初始化 SHALL 在 Workspace 加载过程中完成，确保在 Reconciler 和其他模块使用前已就绪。

#### Scenario: platform DB 初始化

- **WHEN** Workspace 首次加载或 `data/platform.sqlite` 不存在时
- **THEN** 系统 SHALL 创建数据库文件，初始化 WAL 模式和 foreign keys，创建系统表

#### Scenario: 获取 platform DB 连接

- **WHEN** Reconciler 或其他模块需要访问 platform 级数据
- **THEN** SHALL 通过 `workspace.getPlatformDb()` 获取单例连接

### Requirement: 移除 --data CLI 参数

系统 SHALL 移除 `--data` / `-d` CLI 参数和 `COZYBASE_DATA_DIR` 环境变量。数据目录固定为 workspace root 下的 `data/` 子目录。

#### Scenario: 旧参数被忽略

- **WHEN** 用户启动时传入 `--data` 参数
- **THEN** 系统 SHALL 忽略此参数（不报错），数据目录仍为 `workspace/data/`

### Requirement: 移除文件监听

系统 SHALL 移除 WorkspaceWatcher 文件监听功能。Reconcile 操作 SHALL 仅通过显式触发（API 调用 `POST /api/v1/reconcile` 或 CLI 命令）执行。

#### Scenario: 文件变更不触发 reconcile

- **WHEN** 用户直接编辑 `apps/` 下的 YAML 文件后未调用 reconcile API
- **THEN** 系统 SHALL 不自动执行 reconcile

#### Scenario: 通过 API 触发 reconcile

- **WHEN** 发送 `POST /api/v1/reconcile` 请求
- **THEN** 系统 SHALL 执行完整的 reconcile 流程并返回变更结果

### Requirement: Workspace 资源关闭

Workspace SHALL 提供 `close()` 方法，用于在 server 关闭时统一释放所有资源。

关闭操作 SHALL 包含：
- 关闭所有 AppContext（及其持有的 DB 连接）
- 关闭 platform DB 连接

#### Scenario: 优雅关闭

- **WHEN** server 收到 SIGINT 信号
- **THEN** 系统 SHALL 调用 `workspace.close()` 关闭所有数据库连接后退出
