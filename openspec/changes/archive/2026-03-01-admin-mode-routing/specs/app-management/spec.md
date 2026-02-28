## MODIFIED Requirements

### Requirement: 移除 soft delete 机制

系统 SHALL 不再使用 `status = 'deleted'` 的软删除机制。所有删除操作 SHALL 为物理删除。`list` 查询 SHALL 不再按 `status` 字段过滤。

`list` 操作 SHALL 支持可选的 `mode` 参数进行过滤：
- `mode=stable`：只返回 `stableStatus` 不为 `null` 的 APP
- `mode=draft`：只返回 `hasDraft` 为 `true` 的 APP
- 无 `mode` 参数：返回所有 APP

#### Scenario: list 返回所有 APP

- **WHEN** 调用 `list()` 查询 APP 列表，未指定 `mode` 参数
- **THEN** 系统 SHALL 返回所有 APP，不按 `status` 字段过滤

#### Scenario: list 按 stable 模式过滤

- **WHEN** 调用 `list({ mode: 'stable' })` 查询 APP 列表
- **THEN** 系统 SHALL 只返回 `stableStatus` 为 `running` 或 `stopped` 的 APP
- **AND** SHALL 不返回 `stableStatus` 为 `null` 的 APP

#### Scenario: list 按 draft 模式过滤

- **WHEN** 调用 `list({ mode: 'draft' })` 查询 APP 列表
- **THEN** 系统 SHALL 只返回 `hasDraft` 为 `true` 的 APP
- **AND** SHALL 不返回 `hasDraft` 为 `false` 的 APP
