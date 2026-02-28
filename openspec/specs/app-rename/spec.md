# APP Rename

## Purpose

提供 APP 重命名能力，仅在 Stable 版本 stopped 或未发布时可执行。

## Requirements

### Requirement: APP 重命名

系统 SHALL 提供 `rename` 操作，将 APP 的 `name` 从旧值更改为新值，同时迁移所有关联数据。

#### Scenario: 重命名 stopped 的 APP

- **WHEN** 调用 `rename(oldName, newName)`
- **AND** APP 的 `stable_status` 为 `stopped`
- **AND** `newName` 符合命名规则且不与已有 APP 重名
- **THEN** 系统 SHALL 将 `apps`、`app_files`、`api_keys` 中的 app name 全部更新为 `newName`
- **AND** 系统 SHALL 将文件系统目录 `stable/{oldName}` 重命名为 `stable/{newName}`
- **AND** 系统 SHALL 将文件系统目录 `draft/{oldName}` 重命名为 `draft/{newName}`（如存在）

#### Scenario: 重命名未发布的 APP

- **WHEN** 调用 `rename(oldName, newName)`
- **AND** APP 从未发布过（`stable_status` 为 null）
- **AND** `newName` 符合命名规则且不与已有 APP 重名
- **THEN** 系统 SHALL 完成重命名操作

#### Scenario: 拒绝重命名 running 的 APP

- **WHEN** 调用 `rename(oldName, newName)`
- **AND** APP 的 `stable_status` 为 `running`
- **THEN** 系统 SHALL 返回 BadRequestError
- **AND** APP 数据 SHALL 无任何变更

#### Scenario: 重命名为已存在的名称

- **WHEN** 调用 `rename(oldName, newName)`
- **AND** `newName` 已被另一个 APP 使用
- **THEN** 系统 SHALL 返回 AlreadyExistsError

#### Scenario: 重命名为非法名称

- **WHEN** 调用 `rename(oldName, newName)`
- **AND** `newName` 不符合 APP 命名规则（`/^[a-zA-Z0-9_-]+$/`，不以 `_` 开头）
- **THEN** 系统 SHALL 返回 InvalidNameError

### Requirement: 重命名操作原子性

`rename` 操作中的数据库变更 SHALL 在单个事务中完成。如果任一步骤失败，所有变更 SHALL 回滚。

#### Scenario: 数据库操作失败时回滚

- **WHEN** `rename` 操作过程中数据库写入失败
- **THEN** 所有已执行的数据库变更 SHALL 回滚
- **AND** APP 数据 SHALL 保持原始状态
