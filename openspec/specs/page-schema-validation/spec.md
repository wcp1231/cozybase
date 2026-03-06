# Page Schema Validation

## Purpose

定义 `ui/pages.json` 在引入 URL 路径模式后，对页面路径字段与组件节点同时执行结构、语义和引用校验，确保页面数组既能稳定匹配路由，又能继续支持现有组件 ID 与引用校验能力。

## Requirements

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

### Requirement: 页面 schema 使用显式路径字段与数组顺序

系统 SHALL 继续使用 `pages[]` 数组承载页面定义。每个页面对象 MUST 显式包含 `path`、`title` 与 `body` 字段，系统 MUST NOT 改用以路径为 key 的对象结构作为 canonical schema。

#### Scenario: 合法页面对象通过结构校验

- **WHEN** `ui/pages.json` 中某页面定义为 `{ "path": "orders/:orderId", "title": "订单详情", "body": [] }`
- **THEN** 系统 SHALL 认定该页面满足基础结构要求

#### Scenario: 缺少 path 字段时被拒绝

- **WHEN** `ui/pages.json` 中某页面缺少 `path` 字段
- **THEN** 系统 SHALL 拒绝该页面结构
- **AND** 返回结果 SHALL 指明页面路径字段缺失

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

### Requirement: 系统校验页面路径格式与唯一性

所有页面写工具在将结果写回 `ui/pages.json` 前 SHALL 对 `pages[]` 中每个页面的 `path` 执行格式与唯一性校验。`path` MUST 由 `/` 分隔的静态段和参数段组成；静态段 MUST 匹配 `^[a-z0-9][a-z0-9-]*$`，参数段 MUST 匹配 `^:[a-zA-Z][a-zA-Z0-9]*$`。

#### Scenario: 多段参数化路径通过校验

- **WHEN** 页面 `path` 为 `orders/:orderId/refund`
- **THEN** 系统 SHALL 认定该路径合法

#### Scenario: 非法路径段被拒绝

- **WHEN** 页面 `path` 为 `orders//refund` 或 `orders/:123`
- **THEN** 系统 SHALL 拒绝该页面结构
- **AND** 返回结果 SHALL 指明 `path` 格式不合法

#### Scenario: 重复页面路径被拒绝

- **WHEN** `pages[]` 中两个页面都定义了 `path: "orders"`
- **THEN** 系统 SHALL 拒绝该页面文档
- **AND** 返回结果 SHALL 指明重复的页面 `path`

### Requirement: 页面校验保留数组顺序且不隐式重排

系统在规范化与校验 `ui/pages.json` 时 SHALL 保留 `pages[]` 中页面的原有顺序。系统 MUST NOT 因为路径形态、静态段或参数段而自动重排页面数组。

#### Scenario: 校验成功后页面顺序保持不变

- **WHEN** `pages[]` 依次包含 `orders/:orderId` 与 `orders/new`
- **AND** 页面文档通过结构与语义校验
- **THEN** 系统 SHALL 保持这两个页面在数组中的原始顺序

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
