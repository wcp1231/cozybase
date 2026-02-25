## MODIFIED Requirements

### Requirement: App 状态推导

#### Scenario: 无 Stable DB 且无 unstaged changes 的 App（Draft only）

- **WHEN** `apps/{appName}/` 下所有文件已 committed（无 unstaged changes），但 `data/apps/{appName}/db.sqlite` 不存在
- **THEN** 系统 SHALL 推导该 App 状态为 **Draft only**，而非 Stable

> 此场景覆盖 init 后模板 App 已 git commit 但尚未 Publish 的情况。

### Requirement: Workspace 自动初始化

初始化步骤 SHALL 增加第 8 步：

8. 对所有状态为 **Draft only** 的模板 App 执行 Publish 流程（创建 Stable DB、执行 Migration、复制 Functions 到 Stable 目录）

自动 Publish SHALL 仅在首次初始化时执行（通过 `justInitialized` 标记区分），避免后续启动时产生意外行为。

自动 Publish SHALL 在 server 层编排（`workspace.init()` + `workspace.load()` + 创建 Publisher 之后），而非在 `workspace.init()` 内部执行。

#### Scenario: 初始化后模板应用自动 Publish

- **WHEN** 系统首次初始化 workspace 完成后（`workspace.init()` 执行成功）
- **THEN** 系统 SHALL 对所有状态为 **Draft only** 的模板 App 自动执行 Publish 流程，使其状态变为 **Stable**，Stable 路由可正常访问

#### Scenario: 非首次启动不自动 Publish

- **WHEN** workspace 已经初始化过（`workspace.yaml` 存在），server 正常启动
- **THEN** 系统 SHALL 不自动执行 Publish，即使存在 Draft only 状态的 App
