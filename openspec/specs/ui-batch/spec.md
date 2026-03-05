# ui-batch Specification

## Purpose
TBD - created by archiving change ui-batch-operations. Update Purpose after archive.
## Requirements
### Requirement: 系统提供批量 UI 操作入口

系统 SHALL 提供 `ui_batch` 工具，支持在单次调用中按顺序执行多个 UI 与页面操作。每个操作 MUST 显式声明 `op` 类型，并且系统 SHALL 为每个操作返回独立结果。

#### Scenario: 单次调用执行混合操作

- **WHEN** Agent 调用 `ui_batch` 并在 `operations` 中同时提交 `insert`、`update` 与 `get` 操作
- **THEN** 系统 SHALL 按提交顺序依次执行这些操作
- **AND** 返回结果 SHALL 包含每个操作的执行状态与必要输出

### Requirement: 系统支持基于 `$ref` 的跨操作引用

`ui_batch` 中的操作可以声明 `ref` 名称，系统 SHALL 将成功操作产生的节点或页面 ID 绑定到该名称。后续操作中以 `$` 开头的 `parent_id`、`node_id` 或 `new_parent_id` MUST 被解析为已绑定 ID。

#### Scenario: 使用前序插入节点作为后续父节点

- **WHEN** 第一个操作 `insert` 成功并声明 `ref: "$row"`，第二个操作以 `parent_id: "$row"` 再次 `insert`
- **THEN** 系统 SHALL 将第二个操作的 `parent_id` 解析为第一个操作返回的节点 ID
- **AND** 第二个节点 SHALL 被插入到该新建父节点下

### Requirement: 系统对批量操作执行部分成功与级联跳过策略

`ui_batch` SHALL 在单个操作失败后继续执行后续无依赖操作。若某操作引用了失败或已跳过的 `$ref`，该操作 MUST 被标记为 `skipped`。

#### Scenario: 依赖失败引用导致级联跳过

- **WHEN** 第一个操作因父节点不存在而失败并声明 `ref: "$container"`，第二个操作使用 `parent_id: "$container"`
- **THEN** 第二个操作 MUST 被标记为 `skipped`
- **AND** 不依赖 `$container` 的后续操作 SHALL 继续执行

### Requirement: 系统在批量操作中支持页面级编辑

`ui_batch` SHALL 支持 `page_add`、`page_update` 与 `page_remove`。`page_add` 成功后若声明 `ref`，系统 MUST 允许后续节点操作通过该 `ref` 定位新页面。

#### Scenario: 创建页面并立即插入内容

- **WHEN** Agent 在同一次 `ui_batch` 中先执行 `page_add(ref: "$settings", id: "settings")`，再执行 `insert(parent_id: "$settings")`
- **THEN** 系统 SHALL 在新增页面下插入目标节点
- **AND** 返回结果 SHALL 指示两个操作均成功

### Requirement: 批量更新遵循既有字段约束

`ui_batch` 中的 `update` 操作 MUST NOT 允许直接修改节点的 `id` 或 `type` 字段，行为 SHALL 与 `ui_update` 一致。

#### Scenario: 批量更新尝试修改节点类型被拒绝

- **WHEN** Agent 在 `ui_batch` 中提交 `update` 操作并尝试修改节点 `type`
- **THEN** 系统 SHALL 拒绝该操作并返回错误状态
- **AND** 原始节点的 `id` 与 `type` SHALL 保持不变

### Requirement: 系统按批次提交写入并保留只读批次无写入语义

`ui_batch` SHALL 在一次调用内至多执行一次最终写入提交。若批次中没有成功的写操作（例如仅 `get` 或所有写操作均失败/跳过），系统 MUST NOT 写入文件并 MUST 返回未提交状态。

#### Scenario: 纯读取批次不触发写入

- **WHEN** Agent 调用 `ui_batch` 且所有操作均为 `get`
- **THEN** 系统 MUST NOT 修改 `ui/pages.json`
- **AND** 返回结果 MUST 标记本次批次为未提交

#### Scenario: 存在成功写操作时触发单次提交

- **WHEN** Agent 调用 `ui_batch` 且至少一个写操作成功
- **THEN** 系统 SHALL 将所有有效变更一次性写回 `ui/pages.json`
- **AND** 返回结果 MUST 标记本次批次为已提交

