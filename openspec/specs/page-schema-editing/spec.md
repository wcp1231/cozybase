# Page Schema Editing

## Purpose

定义 Agent 面向 `ui/pages.json` 的结构化读取与局部编辑能力，降低整文件读写的上下文成本，并让页面节点可以被稳定定位和修改。
## Requirements
### Requirement: 系统提供页面结构大纲读取能力

系统 SHALL 提供 `ui_outline` 工具，从 Agent working copy 中读取 `ui/pages.json`，并以树形结构返回页面层级、组件层级和关键摘要信息。大纲结果 MUST 包含可用于后续工具调用的稳定节点 ID、组件类型和层级关系，且 MUST NOT 返回整份页面节点的完整属性内容。

#### Scenario: 返回整个页面文件的大纲

- **WHEN** Agent 对存在 `ui/pages.json` 的 APP 调用 `ui_outline`
- **THEN** 系统 SHALL 返回该文件中所有页面的树形结构大纲
- **AND** 每个页面节点 SHALL 包含页面 `id`、`title` 和 `body` 层级
- **AND** 每个组件节点 SHALL 包含组件 `id`、`type` 和摘要信息

#### Scenario: 仅返回指定页面的大纲

- **WHEN** Agent 调用 `ui_outline` 并传入 `pageId`
- **THEN** 系统 SHALL 仅返回该页面的大纲结构
- **AND** 返回结果 MUST NOT 包含其他页面的组件树

#### Scenario: 页面定义文件缺失时返回明确错误

- **WHEN** Agent 对不存在 `ui/pages.json` 的 APP 调用 `ui_outline`
- **THEN** 系统 SHALL 返回明确的文件不存在错误
- **AND** 系统 MUST NOT 返回空的大纲结果冒充成功

### Requirement: 系统提供按节点 ID 读取详情能力

系统 SHALL 提供 `ui_get` 工具，根据稳定节点 ID 从 Agent working copy 中读取指定页面节点的完整详情。`ui_get` MUST 接受来自 `ui_outline` 或 UI 写工具返回结果中的节点 ID 作为输入。

#### Scenario: 读取现有组件节点详情

- **WHEN** Agent 调用 `ui_get(nodeId)` 且该 `nodeId` 对应 `ui/pages.json` 中的现有组件
- **THEN** 系统 SHALL 返回该组件节点的完整 schema 内容
- **AND** 返回结果 SHALL 保留该节点的稳定 `id` 和 `type`

#### Scenario: 节点 ID 不存在时返回错误

- **WHEN** Agent 调用 `ui_get(nodeId)` 且 `nodeId` 不存在于当前 `ui/pages.json`
- **THEN** 系统 SHALL 返回节点不存在错误
- **AND** 系统 MUST NOT 返回模糊匹配或近似结果

### Requirement: 系统提供结构化页面写操作

系统 SHALL 提供 `ui_insert`、`ui_update`、`ui_move` 和 `ui_delete` 工具，对 `ui/pages.json` 执行局部结构化修改。所有写操作 SHALL 以节点 ID 作为定位依据，并在成功后将变更写回 Agent working copy 中的 `ui/pages.json`。这些单操作工具 MUST 维持既有对外语义，并与 `ui_batch` 中对应操作在节点定位、字段约束和错误语义上保持一致。单操作工具对节点树的查找、父级定位与子槽位解析语义 MUST 与 `ui-schema-tree-utils` capability 暴露的共享树工具保持一致。

#### Scenario: 插入新节点到父容器

- **WHEN** Agent 调用 `ui_insert`，传入现有父节点 ID 和合法的新节点内容
- **THEN** 系统 SHALL 将该节点插入到目标父容器的指定位置或末尾
- **AND** 系统 SHALL 返回新插入节点的稳定 `id`
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 反映该插入结果

#### Scenario: 更新节点属性

- **WHEN** Agent 调用 `ui_update`，传入现有节点 ID 和待更新属性
- **THEN** 系统 SHALL 仅更新该节点允许修改的属性
- **AND** 更新后的节点 SHALL 保留原有稳定 `id`

#### Scenario: 移动节点到新父容器

- **WHEN** Agent 调用 `ui_move`，传入现有节点 ID、新父节点 ID 和可选位置
- **THEN** 系统 SHALL 将该节点及其子树移动到新父容器下
- **AND** 被移动节点及其后代的稳定 `id` MUST 保持不变

#### Scenario: 删除节点子树

- **WHEN** Agent 调用 `ui_delete`，传入现有节点 ID
- **THEN** 系统 SHALL 删除该节点及其整个子树
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 不再包含该节点

#### Scenario: 单操作工具与批量同类操作语义一致

- **WHEN** Agent 使用相同输入分别调用 `ui_update` 与包含单个 `update` 操作的 `ui_batch`
- **THEN** 两次调用 SHALL 产生一致的字段更新结果
- **AND** 当输入非法时两次调用 SHALL 返回一致的约束错误语义

#### Scenario: 单操作工具沿用共享树遍历语义

- **WHEN** Agent 对任意受支持子组件槽位中的节点调用 `ui_move` 或 `ui_delete`
- **THEN** 系统 SHALL 使用与 `ui-schema-tree-utils` 相同的节点查找与父级定位语义解析目标
- **AND** 未被本次操作修改的周边树结构 SHALL 保持不变

### Requirement: 页面写工具限制对结构关键字段的直接修改

`ui_update` SHALL 用于属性更新，而 MUST NOT 允许直接修改节点的 `id` 或 `type`。需要改变节点类型或替换整个结构时，系统 SHALL 要求使用删除后插入的新节点流程，而不是原地修改 `type`。

#### Scenario: 尝试修改节点 ID 被拒绝

- **WHEN** Agent 调用 `ui_update` 并试图修改现有节点的 `id`
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 原始节点的稳定 `id` SHALL 保持不变

#### Scenario: 尝试修改节点类型被拒绝

- **WHEN** Agent 调用 `ui_update` 并试图将节点 `type` 从一种组件改为另一种组件
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 系统 SHALL 指示需要通过删除旧节点并插入新节点完成结构替换

### Requirement: 页面编辑工具默认作用于 Agent working copy

`ui_outline`、`ui_get` 以及所有 `ui_*` 页面节点写工具 SHALL 默认读取和写入 Agent working copy 中的 `ui/pages.json`，而不是直接修改 Cozybase backend 中的持久化版本。页面工具产生的变更 SHALL 继续通过现有的 `update_app_file` / `update_app` 工作流同步回 Cozybase。

#### Scenario: 页面写操作先修改 working copy

- **WHEN** Agent 成功调用任一 `ui_*` 页面节点写工具修改 `ui/pages.json`
- **THEN** 变更 SHALL 先落到 Agent working copy
- **AND** 在 Agent 未调用 `update_app_file` 或 `update_app` 前，系统 SHALL 不要求 Cozybase backend 已同步该变更

#### Scenario: 页面读取工具看到 working copy 的最新结果

- **WHEN** Agent 先调用页面写工具成功修改 `ui/pages.json`
- **AND** 随后再次调用 `ui_outline` 或 `ui_get`
- **THEN** 页面读取工具 SHALL 返回 working copy 中最新的页面结构
- **AND** 返回结果 MUST NOT 回退到 backend 中的旧版本
