## ADDED Requirements

### Requirement: 系统仅在 Draft 模式提供可视化 UI 编辑模式

系统 SHALL 在 APP 处于 Draft 模式时提供“编辑 UI”入口，并在进入编辑模式时基于当前 `ui/pages.json` 创建前端本地可编辑草稿。系统 MUST NOT 在 Stable 模式下允许用户进入可写的可视化编辑状态。

#### Scenario: Draft 模式可进入编辑器

- **WHEN** 用户打开某个 APP 的 Draft 预览并点击“编辑 UI”
- **THEN** 系统 SHALL 进入可视化编辑模式
- **AND** 系统 SHALL 基于当前 `ui/pages.json` 初始化本地编辑草稿

#### Scenario: Stable 模式保持只读

- **WHEN** 用户查看 Stable 版本页面
- **THEN** 系统 MUST NOT 提供可写的可视化编辑入口
- **AND** 用户 MUST NOT 通过前端编辑交互修改 Stable 页面定义

### Requirement: 系统支持在页面预览中点选组件并显示当前选区

编辑模式下，系统 SHALL 允许用户直接点击预览中的已渲染组件进行选中。选中结果 MUST 基于组件稳定 `id` 解析，并显示与目标组件对应的可见选区高亮。对于按钮、链接、表单等交互组件，编辑模式中的点选 MUST 优先执行选中语义，而不是触发组件原有业务行为。

#### Scenario: 点击交互组件时优先选中

- **WHEN** 用户在编辑模式中点击预览里的按钮、链接或表单控件
- **THEN** 系统 SHALL 选中对应的 schema 节点
- **AND** 系统 MUST NOT 执行该组件原本的导航、提交或业务动作

#### Scenario: 选中组件后显示可见高亮

- **WHEN** 用户在编辑模式中选中某个已渲染组件
- **THEN** 系统 SHALL 在预览中显示覆盖该组件可见边界的选区高亮
- **AND** 属性面板 SHALL 同步显示该节点的当前信息

### Requirement: 系统提供基于组件 schema 的属性编辑面板

系统 SHALL 根据所选组件类型展示对应的属性编辑面板。属性面板 MUST 至少展示只读的 `id` 与 `type`，并对常见标量、枚举、布尔属性提供表单控件。对于对象、数组或未提供专用控件的复杂属性，系统 SHALL 提供 JSON 编辑入口。

#### Scenario: 选中文本类组件后显示基础字段编辑器

- **WHEN** 用户选中包含 `text`、`label`、`title` 或类似内容字段的组件
- **THEN** 属性面板 SHALL 展示相应可编辑输入控件
- **AND** 用户修改后本地草稿 SHALL 反映该字段的新值

#### Scenario: 复杂属性通过 JSON 编辑

- **WHEN** 用户选中的组件包含对象或数组类型的复杂属性
- **THEN** 系统 SHALL 为该属性提供 JSON 编辑入口
- **AND** 非法 JSON 输入 MUST NOT 被提交到本地草稿

### Requirement: 系统在前端本地维护可撤销的编辑草稿

系统 SHALL 在前端内存中维护 `ui/pages.json` 的本地编辑草稿，并记录可撤销的历史。用户的属性修改、插入和排序操作 MUST 先作用于本地草稿；只有用户显式保存后，系统才 SHALL 将完整更新后的 `ui/pages.json` 写回后端文件接口。系统 SHALL 提供 undo 与 redo。

#### Scenario: 未保存修改不会立即写回文件

- **WHEN** 用户在编辑模式中修改组件属性但尚未点击保存
- **THEN** 预览 SHALL 反映本地草稿中的最新状态
- **AND** 后端持久化的 `ui/pages.json` MUST NOT 因该未保存修改而立即变更

#### Scenario: 用户撤销并重做最近修改

- **WHEN** 用户连续执行一次可写编辑操作后点击 undo，再点击 redo
- **THEN** 系统 SHALL 先恢复到操作前的本地草稿状态
- **AND** 系统 SHALL 在 redo 后重新应用刚才的编辑结果

### Requirement: 系统在保存前提示编辑期间的外部变更冲突

进入编辑模式后，系统 SHALL 记录初始加载的 `ui/pages.json` 快照。若用户保存前检测到当前源文件与该初始快照不同，系统 MUST 显示冲突警告，并允许用户选择覆盖保存、放弃本地修改后重新加载，或取消本次保存。

#### Scenario: Agent 在编辑期间修改页面时提示冲突

- **WHEN** 用户进入编辑模式后，Agent 或其他流程修改了当前 APP 的 `ui/pages.json`
- **AND** 用户随后尝试保存本地草稿
- **THEN** 系统 MUST 显示外部变更冲突警告
- **AND** 系统 SHALL 让用户显式决定是否覆盖这些外部修改

### Requirement: 系统支持向目标位置插入新组件

系统 SHALL 提供按分类浏览的组件插入面板，允许用户把新组件插入到选中页面或容器的指定位置。插入时系统 MUST 生成符合该组件 schema 的默认节点结构，并将其加入本地草稿。

#### Scenario: 向容器插入新组件

- **WHEN** 用户在编辑模式中选择某个可包含子组件的容器并从面板插入新组件
- **THEN** 系统 SHALL 在目标容器的指定位置或末尾新增该组件
- **AND** 新组件 SHALL 以合法默认属性出现在本地草稿中

### Requirement: 系统支持删除组件节点

系统 SHALL 允许用户通过组件树删除目标组件节点。删除操作 MUST 从本地草稿中移除该节点及其整个子树，并纳入 undo/redo 历史。系统 MUST 要求用户在删除前能够明确感知删除目标。

#### Scenario: 从组件树删除节点

- **WHEN** 用户在组件树中对某个组件执行删除操作
- **THEN** 系统 SHALL 从本地草稿中移除该节点及其子树
- **AND** 预览、组件树和属性面板 SHALL 同步反映该删除结果

#### Scenario: 删除后可撤销

- **WHEN** 用户删除某个组件节点后执行 undo
- **THEN** 系统 SHALL 恢复被删除的节点及其原始位置
- **AND** 恢复后的预览与组件树 SHALL 与删除前保持一致

### Requirement: 系统支持通过组件树调整同层组件顺序

系统 SHALL 提供组件树视图，允许用户通过拖拽调整同一父容器下子组件的顺序。系统 MUST NOT 允许通过该交互把组件拖拽到不同父容器下。

#### Scenario: 同层拖拽调整顺序

- **WHEN** 用户在组件树中将某个组件拖拽到同一父容器下的新位置
- **THEN** 系统 SHALL 更新该父容器内子组件的顺序
- **AND** 预览与本地草稿 SHALL 反映新的排序结果

#### Scenario: 跨容器拖拽被拒绝

- **WHEN** 用户尝试把组件从一个父容器拖拽到另一个父容器
- **THEN** 系统 MUST 拒绝该重排操作
- **AND** 原始组件层级关系 SHALL 保持不变
