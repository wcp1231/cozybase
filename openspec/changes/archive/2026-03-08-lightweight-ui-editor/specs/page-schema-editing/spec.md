## MODIFIED Requirements

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
