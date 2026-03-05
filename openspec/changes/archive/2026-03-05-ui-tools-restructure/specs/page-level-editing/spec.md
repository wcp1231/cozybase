# Page-level Editing

## Purpose

定义 Agent 通过页面级 MCP 工具对 `ui/pages.json` 中 `pages[]` 集合进行结构化编辑的能力，覆盖页面新增、删除、元信息更新与排序操作。

## ADDED Requirements

### Requirement: 系统提供页面列表读取能力

系统 SHALL 提供 `pages_list` 工具，从 Agent working copy 中读取 `ui/pages.json`，并返回页面列表摘要。返回结果 MUST 包含每个页面的 `id` 与 `title`，且 MUST NOT 返回页面 `body` 的完整组件树。

#### Scenario: 成功返回页面列表摘要

- **WHEN** Agent 对存在 `ui/pages.json` 的 APP 调用 `pages_list`
- **THEN** 系统 SHALL 返回 `pages[]` 中全部页面的摘要列表
- **AND** 每个页面摘要 SHALL 包含页面 `id` 与 `title`
- **AND** 返回结果 MUST NOT 包含页面 `body` 的完整节点详情

#### Scenario: 页面定义文件缺失时返回明确错误

- **WHEN** Agent 对不存在 `ui/pages.json` 的 APP 调用 `pages_list`
- **THEN** 系统 SHALL 返回明确的文件不存在错误
- **AND** 系统 MUST NOT 返回空页面列表冒充成功

### Requirement: 系统提供页面级结构化写操作

系统 SHALL 提供 `pages_add`、`pages_remove`、`pages_update` 与 `pages_reorder` 工具，对 `ui/pages.json` 的 `pages[]` 执行结构化增删改排序操作。所有写操作 SHALL 在成功后写回 Agent working copy 中的 `ui/pages.json`。

#### Scenario: 添加新页面

- **WHEN** Agent 调用 `pages_add` 并传入合法且未重复的 `id`
- **THEN** 系统 SHALL 在 `pages[]` 中新增该页面
- **AND** 新页面 SHALL 至少包含 `id`、`title` 与空 `body` 结构
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 反映该新增结果

#### Scenario: 删除已有页面

- **WHEN** Agent 调用 `pages_remove` 并传入存在的 `pageId`
- **THEN** 系统 SHALL 从 `pages[]` 中删除目标页面
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 不再包含该页面

#### Scenario: 更新页面元信息

- **WHEN** Agent 调用 `pages_update` 并传入存在的 `pageId` 与新的页面标题
- **THEN** 系统 SHALL 更新目标页面的 `title`
- **AND** 目标页面的 `id` SHALL 保持不变

#### Scenario: 调整页面顺序

- **WHEN** Agent 调用 `pages_reorder` 并传入存在的 `pageId` 与目标 `index`
- **THEN** 系统 SHALL 将目标页面移动到 `pages[]` 的指定位置
- **AND** 其余页面的相对顺序 SHALL 按移动语义更新

### Requirement: 页面级工具校验页面标识合法性与唯一性

`pages_add` SHALL 要求调用方显式传入页面 `id`，并对其执行格式与唯一性校验。页面 `id` MUST 匹配小写字母、数字和连字符格式，且 MUST NOT 与现有页面重复。

#### Scenario: 非法页面 ID 被拒绝

- **WHEN** Agent 调用 `pages_add` 且 `id` 不符合允许格式
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 返回结果 SHALL 明确指出 `id` 格式不合法

#### Scenario: 重复页面 ID 被拒绝

- **WHEN** Agent 调用 `pages_add` 且 `id` 与现有页面重复
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 返回结果 SHALL 明确指出页面 `id` 冲突

### Requirement: 页面级工具默认作用于 Agent working copy

`pages_list` 以及所有页面级写工具 SHALL 默认读取和写入 Agent working copy 中的 `ui/pages.json`，而不是直接修改 Cozybase backend 中的持久化版本。页面级工具产生的变更 SHALL 继续通过现有的 `update_app_file` / `update_app` 工作流同步回 Cozybase。

#### Scenario: 页面级写操作先修改 working copy

- **WHEN** Agent 成功调用任一页面级写工具修改 `ui/pages.json`
- **THEN** 变更 SHALL 先落到 Agent working copy
- **AND** 在 Agent 未调用 `update_app_file` 或 `update_app` 前，系统 SHALL 不要求 Cozybase backend 已同步该变更

#### Scenario: 页面级读取工具看到 working copy 的最新结果

- **WHEN** Agent 先调用页面级写工具成功修改 `ui/pages.json`
- **AND** 随后再次调用 `pages_list`
- **THEN** 页面级读取工具 SHALL 返回 working copy 中最新的页面列表
- **AND** 返回结果 MUST NOT 回退到 backend 中的旧版本
