## MODIFIED Requirements

### Requirement: Workspace 自动初始化

当 workspace 目录不存在或未初始化时，系统 SHALL 自动执行完整初始化流程，无需用户手动干预。

初始化步骤 SHALL 包含：
1. 创建 workspace root 目录（若不存在）
2. 创建 `apps/`、`data/` 和 `draft/` 子目录
3. 写入 `workspace.yaml`（默认 name 为 `"cozybase"`，version 为 `1`）
4. 写入 `.gitignore`（忽略 `data/`、`draft/`、`*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`）
5. 执行 `git init`
6. 从 `packages/server/templates/` 目录中复制所有模板应用到 `apps/` 目录（使用 `fs.cpSync` 递归复制）
7. 执行初始 git commit

模板路径 SHALL 通过 `import.meta.dir` 相对定位到 `packages/server/templates/`，不依赖外部配置。

若模板目录不存在或为空，初始化 SHALL 正常完成（跳过模板复制步骤），并打印警告信息。

#### Scenario: 首次启动自动初始化

- **WHEN** 用户首次启动 server，且 workspace 路径下不存在 `workspace.yaml`
- **THEN** 系统 SHALL 自动完成初始化，创建完整目录结构（含 `draft/`）、从模板目录复制示例 app 到 `apps/` 目录、并执行初始 git commit

#### Scenario: 模板应用复制

- **WHEN** 系统执行初始化且 `packages/server/templates/` 目录下存在 `welcome/` 子目录
- **THEN** 系统 SHALL 将 `templates/welcome/` 的完整目录内容递归复制到 `apps/welcome/`，保持目录结构不变

#### Scenario: 已初始化的 workspace 不再重复初始化

- **WHEN** workspace root 下已存在 `workspace.yaml`
- **THEN** 系统 SHALL 跳过初始化流程，直接加载现有配置

#### Scenario: git 不可用时的降级处理

- **WHEN** 系统环境中未安装 git
- **THEN** 初始化 SHALL 跳过 `git init` 和初始 commit 步骤，打印警告信息，其余步骤正常完成

#### Scenario: 模板目录不存在时的降级处理

- **WHEN** `packages/server/templates/` 目录不存在或为空
- **THEN** 初始化 SHALL 正常完成，跳过模板复制步骤，并打印警告信息
