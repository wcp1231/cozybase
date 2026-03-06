# Page-level Editing

## Purpose

定义 Agent 通过页面级 MCP 工具对 `ui/pages.json` 中 `pages[]` 集合进行结构化编辑时，如何使用 URL 路径模式作为页面标识，并保持页面数组顺序的可控性。

## MODIFIED Requirements

### Requirement: 系统提供页面列表读取能力

系统 SHALL 提供 `pages_list` 工具，从 Agent working copy 中读取 `ui/pages.json`，并返回页面列表摘要。返回结果 MUST 包含每个页面的 `path` 与 `title`，且 MUST NOT 返回页面 `body` 的完整组件树。

#### Scenario: 成功返回页面路径摘要

- **WHEN** Agent 对存在 `ui/pages.json` 的 APP 调用 `pages_list`
- **THEN** 系统 SHALL 按 `pages[]` 当前顺序返回全部页面的摘要列表
- **AND** 每个页面摘要 SHALL 包含页面 `path` 与 `title`
- **AND** 返回结果 MUST NOT 包含页面 `body` 的完整节点详情

### Requirement: 系统提供基于页面路径的结构化写操作

系统 SHALL 提供 `pages_add`、`pages_remove`、`pages_update` 与 `pages_reorder` 工具，对 `ui/pages.json` 的 `pages[]` 执行结构化增删改排序操作。所有写操作 SHALL 在成功后写回 Agent working copy 中的 `ui/pages.json`。

#### Scenario: 添加新页面

- **WHEN** Agent 调用 `pages_add` 并传入合法且未重复的 `path`
- **THEN** 系统 SHALL 在 `pages[]` 中新增该页面
- **AND** 新页面 SHALL 至少包含 `path`、`title` 与空 `body` 结构
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 反映该新增结果

#### Scenario: 删除已有页面

- **WHEN** Agent 调用 `pages_remove` 并传入存在的 `page_path`
- **THEN** 系统 SHALL 从 `pages[]` 中删除目标页面
- **AND** Agent working copy 中的 `ui/pages.json` SHALL 不再包含该页面

#### Scenario: 更新页面标题

- **WHEN** Agent 调用 `pages_update` 并传入存在的 `page_path` 与新的页面标题
- **THEN** 系统 SHALL 更新目标页面的 `title`
- **AND** 目标页面的 `path` SHALL 保持不变

#### Scenario: 调整页面顺序

- **WHEN** Agent 调用 `pages_reorder` 并传入存在的 `page_path` 与目标 `index`
- **THEN** 系统 SHALL 将目标页面移动到 `pages[]` 的指定位置
- **AND** 其余页面的相对顺序 SHALL 按移动语义更新

### Requirement: 页面级工具校验页面路径合法性与唯一性

`pages_add` SHALL 要求调用方显式传入页面 `path`，并对其执行格式与唯一性校验。页面 `path` MUST 匹配支持静态段与 `:param` 段的 URL 路径模式，且 MUST NOT 与现有页面重复。

#### Scenario: 非法页面路径被拒绝

- **WHEN** Agent 调用 `pages_add` 且 `path` 不符合允许格式
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 返回结果 SHALL 明确指出 `path` 格式不合法

#### Scenario: 重复页面路径被拒绝

- **WHEN** Agent 调用 `pages_add` 且 `path` 与现有页面重复
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 返回结果 SHALL 明确指出页面 `path` 冲突

### Requirement: 页面级工具保留数组顺序语义

页面级工具在进行新增与重排时 SHALL 保留 `pages[]` 的显式顺序语义，因为该顺序同时用于默认首页、Tab 展示顺序与路由匹配优先级。

#### Scenario: 指定插入位置影响默认页面顺序

- **WHEN** Agent 调用 `pages_add` 为顶层页面传入 `index: 0`
- **THEN** 系统 SHALL 将该页面插入到 `pages[]` 开头
- **AND** 后续访问 APP 根路径时，该页面 SHALL 成为首个可重定向的顶层页面
