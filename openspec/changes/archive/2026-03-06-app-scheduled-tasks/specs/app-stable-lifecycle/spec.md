## MODIFIED Requirements

### Requirement: Stable 版本具有 running 和 stopped 两种运行时状态
已发布的 APP 的 Stable 版本 SHALL 具有 `running` 和 `stopped` 两种持久化运行时状态。`running` 状态的 Stable 版本 SHALL 在 Daemon 中加载并运行 runtime 实例。`stopped` 状态的 Stable 版本 SHALL 不运行 runtime 实例。Daemon 启动时，系统 SHALL 仅在 APP 的 `hasDraft == true` 且 Draft 环境已物化（例如存在 `.reconcile-state.json`）时启动 Draft runtime；对于 `hasDraft == false` 的 APP，系统 MUST NOT 仅因为存在已物化 Draft 痕迹而自动恢复 Draft runtime。

对处于 `running` 的 Stable APP，系统 SHALL 通过 `ScheduleManager.loadApp(appName)` 加载该 APP 的 schedules；当 Stable APP 不再运行时，系统 SHALL 通过 `ScheduleManager.unloadApp(appName)` 卸载其 schedules。

#### Scenario: 已发布 APP 默认为 running

- **WHEN** APP 首次 publish 成功
- **THEN** Stable 版本的状态 SHALL 为 `running`
- **AND** Daemon SHALL 启动该 APP 的 stable runtime 实例
- **AND** Daemon SHALL 加载该 APP 的 schedules

#### Scenario: Daemon 启动时按 stable_status 加载

- **WHEN** Daemon 启动
- **AND** APP 的 `stable_status` 为 `running`
- **THEN** Daemon SHALL 启动该 APP 的 stable runtime 实例
- **AND** Daemon SHALL 加载该 APP 的 schedules

#### Scenario: Daemon 启动时不加载 stopped APP

- **WHEN** Daemon 启动
- **AND** APP 的 `stable_status` 为 `stopped`
- **THEN** Daemon SHALL 不启动该 APP 的 stable runtime 实例
- **AND** Daemon SHALL 不加载该 APP 的 schedules

#### Scenario: Daemon 启动时加载有 Draft 变更且已物化的 Draft 环境

- **WHEN** Daemon 启动
- **AND** APP 的 `hasDraft` 为 `true`
- **AND** APP 的 Draft 数据目录中存在 `.reconcile-state.json`
- **THEN** Daemon SHALL 启动该 APP 的 Draft runtime 实例

#### Scenario: Daemon 启动时不自动恢复 prepare 产生的 Draft 环境

- **WHEN** Daemon 启动
- **AND** APP 的 `stable_status` 不为 `null`
- **AND** APP 的 `hasDraft` 为 `false`
- **AND** APP 的 Draft 数据目录中存在 `.reconcile-state.json`
- **THEN** Daemon MUST NOT 启动该 APP 的 Draft runtime 实例

#### Scenario: Daemon 启动时不加载未物化的 Draft 环境

- **WHEN** Daemon 启动
- **AND** APP 的 `hasDraft` 为 `true`
- **AND** APP 的 Draft 数据目录中不存在 `.reconcile-state.json`
- **THEN** Daemon MUST NOT 启动该 APP 的 Draft runtime 实例

#### Scenario: 已发布 APP 再次 publish 后重载 schedules

- **WHEN** APP 已发布且再次 publish 成功
- **THEN** 系统 SHALL 重新加载该 APP 的 Stable runtime
- **AND** 系统 SHALL 调用 `ScheduleManager.reloadApp(appName)` 使 schedule 配置生效

### Requirement: stop Stable 版本
系统 SHALL 提供 `stopStable` 操作，将 Stable 版本从 `running` 切换为 `stopped`。

#### Scenario: 停止运行中的 Stable 版本

- **WHEN** 调用 `stopStable(appName)`
- **AND** APP 的 `stable_status` 为 `running`
- **THEN** 系统 SHALL 将 `stable_status` 更新为 `stopped`
- **AND** 系统 SHALL 停止该 APP 的 stable runtime 实例
- **AND** 系统 SHALL 调用 `ScheduleManager.unloadApp(appName)` 停止该 APP 的所有 schedules

#### Scenario: 停止已 stopped 的 Stable 版本（幂等）

- **WHEN** 调用 `stopStable(appName)`
- **AND** APP 的 `stable_status` 已经为 `stopped`
- **THEN** 操作 SHALL 成功且无变更

#### Scenario: 停止未发布的 APP

- **WHEN** 调用 `stopStable(appName)`
- **AND** APP 从未发布过（`stable_status` 为 null）
- **THEN** 系统 SHALL 返回 BadRequestError

#### Scenario: stop Stable 不影响 Draft

- **WHEN** 调用 `stopStable(appName)`
- **AND** APP 同时有 Draft 版本在运行
- **THEN** Draft runtime 实例 SHALL 不受影响，继续运行

### Requirement: start Stable 版本
系统 SHALL 提供 `startStable` 操作，将 Stable 版本从 `stopped` 切换为 `running`。

#### Scenario: 启动 stopped 的 Stable 版本

- **WHEN** 调用 `startStable(appName)`
- **AND** APP 的 `stable_status` 为 `stopped`
- **THEN** 系统 SHALL 将 `stable_status` 更新为 `running`
- **AND** 系统 SHALL 启动该 APP 的 stable runtime 实例
- **AND** 系统 SHALL 调用 `ScheduleManager.loadApp(appName)` 加载该 APP 的 schedules

#### Scenario: 启动已 running 的 Stable 版本（幂等）

- **WHEN** 调用 `startStable(appName)`
- **AND** APP 的 `stable_status` 已经为 `running`
- **THEN** 操作 SHALL 成功且无变更

#### Scenario: 启动未发布的 APP

- **WHEN** 调用 `startStable(appName)`
- **AND** APP 从未发布过（`stable_status` 为 null）
- **THEN** 系统 SHALL 返回 BadRequestError
