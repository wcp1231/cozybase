# Page Schema Validation

## Purpose

定义 `ui/pages.json` 的稳定组件 ID、规范化和严格校验行为，确保 Agent 通过页面工具写入的页面结构在保存前就是合法且可稳定引用的。

## ADDED Requirements

### Requirement: 系统为所有组件节点维护稳定 ID

系统 SHALL 为 `ui/pages.json` 中的所有组件节点维护稳定 `id`。通过页面工具新建的组件节点 MUST 由系统自动生成稳定 `id`，而已有组件节点的 `id` 在后续更新、移动和重新读取过程中 MUST 保持不变。

#### Scenario: 插入新节点时自动生成组件 ID

- **WHEN** Agent 调用 `page_insert` 插入一个不含 `id` 的新组件节点
- **THEN** 系统 SHALL 为该节点自动生成稳定 `id`
- **AND** 返回结果 SHALL 包含该生成后的 `id`
- **AND** 写回的 `ui/pages.json` SHALL 持久化该 `id`

#### Scenario: 移动或更新节点后 ID 保持稳定

- **WHEN** Agent 对现有组件节点执行 `page_update` 或 `page_move`
- **THEN** 该节点原有的 `id` SHALL 保持不变
- **AND** 其后续读取结果 SHALL 继续使用同一 `id`

#### Scenario: 旧页面文件缺少组件 ID 时自动补齐

- **WHEN** Agent 对历史遗留的无组件 `id` 的 `ui/pages.json` 调用任一页面工具
- **THEN** 系统 SHALL 在写入前为缺失 `id` 的组件节点自动补齐稳定 `id`
- **AND** 补齐后的 `id` SHALL 写回 working copy 供后续工具继续使用

### Requirement: 页面工具在写入前执行严格结构校验

所有页面写工具在将结果写回 `ui/pages.json` 前 SHALL 对更新后的完整页面文档执行结构校验。任何违反页面 schema 的写入请求 MUST 被拒绝，且 MUST NOT 部分写入 working copy。

#### Scenario: 结构不合法的组件被拒绝

- **WHEN** Agent 通过页面写工具写入一个缺少必填字段的组件节点
- **THEN** 系统 SHALL 拒绝该写入
- **AND** 系统 SHALL 返回说明具体结构错误的校验结果
- **AND** working copy 中的 `ui/pages.json` SHALL 保持写入前状态

#### Scenario: 未知组件类型被拒绝

- **WHEN** Agent 通过页面写工具写入一个 `type` 不受支持的组件节点
- **THEN** 系统 SHALL 拒绝该写入
- **AND** 返回的校验结果 SHALL 明确指出该 `type` 非法

### Requirement: 页面工具在写入前执行语义与引用校验

除了结构校验外，所有页面写工具在写入前 SHALL 对更新后的页面文档执行语义与引用校验。任何无效引用、重复组件 ID 或其他会破坏页面稳定寻址的状态 MUST 被拒绝。

#### Scenario: reload 目标引用不存在时被拒绝

- **WHEN** Agent 写入包含 `reload` action 的节点
- **AND** 该 action 的 `target` 不存在于当前页面结构中
- **THEN** 系统 SHALL 拒绝该写入
- **AND** 返回结果 SHALL 指明无效引用的目标值

#### Scenario: 组件 ID 冲突时被拒绝

- **WHEN** 更新后的 `ui/pages.json` 中出现重复的组件 `id`
- **THEN** 系统 SHALL 拒绝该写入
- **AND** 返回结果 SHALL 指明发生冲突的 `id`

### Requirement: 页面读取工具对无效页面文件返回校验错误

当 Agent 调用 `page_outline` 或 `page_get` 读取 `ui/pages.json` 时，系统 SHALL 先校验当前 working copy 中的页面文件。若页面文件本身已处于无效状态，系统 MUST 返回明确的校验错误，而不是返回部分成功或未经校验的结构结果。

#### Scenario: 无效页面文件阻止大纲读取

- **WHEN** Agent 调用 `page_outline`
- **AND** 当前 `ui/pages.json` 含有不合法的页面结构
- **THEN** 系统 SHALL 返回校验错误
- **AND** 系统 MUST NOT 返回部分页面大纲结果

#### Scenario: 无效页面文件阻止节点详情读取

- **WHEN** Agent 调用 `page_get(nodeId)`
- **AND** 当前 `ui/pages.json` 含有不合法的页面结构
- **THEN** 系统 SHALL 返回校验错误
- **AND** 系统 MUST NOT 返回未经校验的节点详情
