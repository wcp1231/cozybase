## MODIFIED Requirements

### Requirement: 系统提供 prepare API 按需物化 stable-only APP 的 Draft 环境

系统 SHALL 提供 `POST /draft/apps/:appSlug/prepare` API，用于对已发布且 `hasDraft == false` 的 APP 按需创建可运行的 Draft 环境。该流程 SHALL 通过 rebuild 语义完成 Draft 环境物化，并确保 Draft DB、依赖安装、配置重载以及 Draft runtime 均已就绪；该流程在不修改 `current_version` 的前提下 MUST 保持完整可用的 Draft 环境。

#### Scenario: stable-only APP 调用 prepare 成功

- **WHEN** 已发布 APP 的 `stable_status` 不为 `null`
- **AND** 该 APP 的 `hasDraft` 为 `false`
- **AND** 客户端调用 `POST /draft/apps/:appSlug/prepare`
- **THEN** 系统 SHALL 成功完成 Draft 环境物化（包括 Draft DB、functions 和 UI 导出）
- **AND** 系统 SHALL 启动或重启该 APP 的 Draft runtime

#### Scenario: prepare 调用保持幂等

- **WHEN** 同一个 APP 已经完成过一次 prepare
- **AND** 客户端再次调用 `POST /draft/apps/:appSlug/prepare`
- **THEN** 操作 SHALL 成功并返回成功结果
- **AND** 系统 MUST NOT 重复创建多个 Draft runtime 实例
- **AND** 该 APP 的 `current_version` 与 `published_version` SHALL 保持不变

#### Scenario: 未发布 APP 调用 prepare 被拒绝

- **WHEN** APP 的 `stable_status` 为 `null`
- **AND** 客户端调用 `POST /draft/apps/:appSlug/prepare`
- **THEN** 系统 SHALL 返回 BadRequestError

### Requirement: DraftReconciler 支持 force 模式以复用 reconcile 逻辑

系统 SHALL 以 `DraftRebuilder.rebuild()` 复用原 reconcile 的完整 Draft 物化流程，并继续支持 `options.force` 参数。当 `force == true` 时，系统 SHALL 在 `hasDraft == false` 的情况下继续执行 rebuild 主流程；当 `force` 未开启时，现有校验行为 MUST 保持不变。

#### Scenario: force 模式允许在 hasDraft 为 false 时执行 reconcile

- **WHEN** APP 的 `hasDraft` 为 `false`
- **AND** 系统以 `rebuild(appSlug, { force: true })` 触发 Draft 重建
- **THEN** 系统 SHALL 跳过 `hasDraft` 前置校验并继续执行完整 rebuild

#### Scenario: 非 force 模式下 hasDraft 为 false 仍然报错

- **WHEN** APP 的 `hasDraft` 为 `false`
- **AND** 系统以默认方式调用 `rebuild(appSlug)`
- **THEN** 系统 SHALL 返回 `App '<appSlug>' has no draft changes` 对应的错误语义
