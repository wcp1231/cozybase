# UI Schema Tree Utils

## Purpose

定义 `@cozybase/ui` 中前后端共用的页面 schema 树遍历、定位与结构化变更辅助语义。

## Requirements

### Requirement: `@cozybase/ui` 提供共享的页面 schema 树工具入口

系统 SHALL 在 `@cozybase/ui` 中提供可被前端与 daemon 共用的页面 schema 树工具导出。该能力 MUST 以纯函数形式工作，且 MUST NOT 依赖文件系统、HTTP、数据库或浏览器 DOM。

#### Scenario: 前后端复用同一套树工具

- **WHEN** 前端可视化编辑器与 daemon 页面编辑逻辑都需要遍历 `PagesJson`
- **THEN** 两者 SHALL 从 `@cozybase/ui` 导入同一套树工具
- **AND** 这些工具 SHALL 在两个运行环境中都可直接使用

### Requirement: 共享树工具支持按稳定节点 ID 查找节点及其父级上下文

系统 SHALL 提供基于稳定节点 `id` 的查找能力。查找结果 MUST 能标识目标节点本身，以及其所在父级上下文中的位置，以便上层调用方继续执行更新、插入、删除或排序。

#### Scenario: 查找嵌套节点返回父级定位信息

- **WHEN** 调用方使用某个已存在的节点 `id` 在页面 schema 树中查找目标
- **THEN** 共享树工具 SHALL 返回该节点
- **AND** 返回结果 SHALL 包含该节点所属父级与同级位置的定位信息

#### Scenario: 节点不存在时返回明确未命中结果

- **WHEN** 调用方查找一个不存在于当前页面 schema 中的节点 `id`
- **THEN** 共享树工具 SHALL 返回明确的未命中结果
- **AND** 调用方 MUST NOT 得到模糊匹配或近似节点

### Requirement: 共享树工具统一遍历受支持的子组件插槽

共享树工具 SHALL 按统一规则遍历页面 `body` 以及各组件声明支持的子组件插槽。无论子节点存在于数组型子槽位还是单节点槽位，工具对外暴露的遍历语义 MUST 保持一致。

#### Scenario: 数组型与单节点槽位都可被遍历

- **WHEN** 页面 schema 同时包含数组型子组件集合与单节点渲染槽位
- **THEN** 共享树工具 SHALL 能发现这两类子节点
- **AND** 调用方 SHALL 以一致方式访问这些子节点的遍历结果

### Requirement: 共享树工具提供稳定的结构化变更辅助语义

共享树工具 SHALL 为上层调用方提供稳定的结构化变更辅助语义，使插入、删除与同层重排操作能够在不影响无关节点稳定 `id` 的前提下更新页面树。对非法父节点或不支持子节点的目标，工具 MUST 返回明确错误或失败结果。

#### Scenario: 同层重排不改变无关节点 ID

- **WHEN** 调用方利用共享树工具将某个节点在同一父级下移动到新的索引位置
- **THEN** 目标父级中的顺序 SHALL 按移动语义更新
- **AND** 未被替换或删除的节点 SHALL 保留原有稳定 `id`

#### Scenario: 非法父节点被拒绝

- **WHEN** 调用方尝试把新节点插入到不支持子组件的目标节点下
- **THEN** 共享树工具 MUST 返回明确的失败结果
- **AND** 原始页面树 SHALL 保持不变
