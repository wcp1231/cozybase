# APP Management

## Purpose

定义 APP 的核心状态模型、状态推导逻辑、delete 守卫规则以及 publish 行为。

## Requirements

### Requirement: 双维状态模型

APP 的状态 SHALL 由两个独立维度组成：

1. **Stable 状态**（`stableStatus`）：`'running' | 'stopped' | null`，其中 `null` 表示从未发布。
2. **Draft 存在性**（`hasDraft`）：`boolean`，从版本号推导。

#### Scenario: 新创建的 APP 状态

- **WHEN** 创建一个新 APP
- **THEN** `stableStatus` SHALL 为 `null`
- **AND** `hasDraft` SHALL 为 `true`

#### Scenario: 首次发布后状态

- **WHEN** APP 首次 publish 成功
- **THEN** `stableStatus` SHALL 为 `running`
- **AND** `hasDraft` SHALL 为 `false`

#### Scenario: Stable APP 修改文件后状态

- **WHEN** 对已发布的 APP 修改资源文件
- **THEN** `stableStatus` SHALL 保持不变
- **AND** `hasDraft` SHALL 为 `true`

#### Scenario: 有 Draft 的 APP 再次发布后状态

- **WHEN** Stable 状态为 `stopped` 的 APP publish 成功
- **THEN** `stableStatus` SHALL 保持 `stopped`
- **AND** `hasDraft` SHALL 为 `false`

### Requirement: DB schema 中 stable_status 字段

`apps` 表 SHALL 包含 `stable_status TEXT DEFAULT NULL` 字段，取值为 `'running'`、`'stopped'` 或 `NULL`。

旧的 `status` 字段不再使用，代码中 SHALL 不再读取或写入 `status` 字段。

#### Scenario: stable_status 持久化

- **WHEN** Daemon 重启
- **THEN** 系统 SHALL 从 `apps.stable_status` 字段恢复每个 APP 的 Stable 运行时状态

### Requirement: hasDraft 状态推导

`hasDraft` SHALL 从版本号推导：当 `current_version > published_version` 时为 `true`，否则为 `false`。

#### Scenario: 版本号相等时无 Draft

- **WHEN** APP 的 `current_version` 等于 `published_version`
- **THEN** `hasDraft` SHALL 为 `false`

#### Scenario: 版本号不等时有 Draft

- **WHEN** APP 的 `current_version` 大于 `published_version`
- **THEN** `hasDraft` SHALL 为 `true`

### Requirement: delete 操作状态守卫

`delete` 操作 SHALL 检查 APP 的 `stableStatus`，只有满足以下条件之一才允许删除：
- `stableStatus` 为 `null`（从未发布，Draft-only APP）
- `stableStatus` 为 `stopped`

删除为物理删除，SHALL 移除 `apps`、`app_files`、`api_keys` 记录以及 `stable/` 和 `draft/` 目录。

#### Scenario: 删除 running 的 APP

- **WHEN** 调用 `delete(appName)`
- **AND** APP 的 `stableStatus` 为 `running`
- **THEN** 系统 SHALL 返回 BadRequestError
- **AND** APP 数据 SHALL 无任何变更

#### Scenario: 删除 stopped 的 APP

- **WHEN** 调用 `delete(appName)`
- **AND** APP 的 `stableStatus` 为 `stopped`
- **THEN** 系统 SHALL 物理删除该 APP 的所有记录和文件

#### Scenario: 删除 Draft-only APP

- **WHEN** 调用 `delete(appName)`
- **AND** APP 从未发布过（`stableStatus` 为 `null`）
- **THEN** 系统 SHALL 物理删除该 APP 的所有记录和文件

### Requirement: publish 行为按 stableStatus 区分

publish 操作成功后，`stable_status` 的更新逻辑 SHALL 根据发布前的状态区分：

- 首次发布（`stable_status` 为 `NULL`）→ 设为 `'running'`
- 再次发布（`stable_status` 为 `'running'`）→ 保持 `'running'`
- 再次发布（`stable_status` 为 `'stopped'`）→ 保持 `'stopped'`

#### Scenario: 首次发布设为 running

- **WHEN** APP 首次 publish 成功
- **AND** 发布前 `stable_status` 为 `NULL`
- **THEN** 系统 SHALL 将 `stable_status` 设为 `'running'`
- **AND** 系统 SHALL 启动 stable runtime

#### Scenario: stopped APP 发布后保持 stopped

- **WHEN** `stable_status` 为 `stopped` 的 APP publish 成功
- **THEN** 系统 SHALL 保持 `stable_status` 为 `'stopped'`
- **AND** 系统 SHALL 不启动 stable runtime
- **AND** stable 目录中的文件 SHALL 已更新为最新发布内容

#### Scenario: running APP 发布后保持 running

- **WHEN** `stable_status` 为 `running` 的 APP publish 成功
- **THEN** 系统 SHALL 保持 `stable_status` 为 `'running'`
- **AND** 系统 SHALL 重启 stable runtime 以加载新内容

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
