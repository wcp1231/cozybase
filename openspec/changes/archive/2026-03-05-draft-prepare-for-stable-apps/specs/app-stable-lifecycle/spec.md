# APP Stable Lifecycle

## MODIFIED Requirements

### Requirement: Stable 版本具有 running 和 stopped 两种运行时状态

已发布的 APP 的 Stable 版本 SHALL 具有 `running` 和 `stopped` 两种持久化运行时状态。`running` 状态的 Stable 版本 SHALL 在 Daemon 中加载并运行 runtime 实例。`stopped` 状态的 Stable 版本 SHALL 不运行 runtime 实例。Daemon 启动时，系统 SHALL 仅在 APP 的 `hasDraft == true` 且 Draft 环境已物化（例如存在 `.reconcile-state.json`）时启动 Draft runtime；对于 `hasDraft == false` 的 APP，系统 MUST NOT 仅因为存在已物化 Draft 痕迹而自动恢复 Draft runtime。

#### Scenario: 已发布 APP 默认为 running

- **WHEN** APP 首次 publish 成功
- **THEN** Stable 版本的状态 SHALL 为 `running`
- **AND** Daemon SHALL 启动该 APP 的 stable runtime 实例

#### Scenario: Daemon 启动时按 stable_status 加载

- **WHEN** Daemon 启动
- **AND** APP 的 `stable_status` 为 `running`
- **THEN** Daemon SHALL 启动该 APP 的 stable runtime 实例

#### Scenario: Daemon 启动时不加载 stopped APP

- **WHEN** Daemon 启动
- **AND** APP 的 `stable_status` 为 `stopped`
- **THEN** Daemon SHALL 不启动该 APP 的 stable runtime 实例

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
