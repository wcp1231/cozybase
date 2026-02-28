# Admin APP List

## Purpose

定义 Admin UI 中 APP 列表页的 Tab 过滤、Badge 显示和 Stable/Draft 模式导航行为。

## ADDED Requirements

### Requirement: API 返回双维状态字段

`GET /api/v1/apps` 返回的 APP 数据 SHALL 包含 `stableStatus` 和 `hasDraft` 字段，替代旧的 `state` 字段。

#### Scenario: API 响应包含新状态字段

- **WHEN** 请求 `GET /api/v1/apps`
- **THEN** 每个 APP 对象 SHALL 包含 `stableStatus`（`'running' | 'stopped' | null`）和 `hasDraft`（`boolean`）字段

### Requirement: Stable Tab 过滤逻辑

Stable tab SHALL 显示所有 `stableStatus` 不为 `null` 的 APP（即 `running` 或 `stopped` 的 APP）。

#### Scenario: Stable tab 显示已发布 APP

- **WHEN** 用户查看 Stable tab
- **THEN** 列表 SHALL 包含所有 `stableStatus` 为 `running` 或 `stopped` 的 APP
- **AND** 列表 SHALL 不包含 `stableStatus` 为 `null` 的 APP

### Requirement: Draft Tab 过滤逻辑

Draft tab SHALL 显示所有 `hasDraft` 为 `true` 的 APP。

#### Scenario: Draft tab 显示有 Draft 的 APP

- **WHEN** 用户查看 Draft tab
- **THEN** 列表 SHALL 包含所有 `hasDraft` 为 `true` 的 APP
- **AND** 列表 SHALL 不包含 `hasDraft` 为 `false` 的 APP

#### Scenario: 同时有 Stable 和 Draft 的 APP 出现在两个 tab

- **WHEN** 一个 APP 的 `stableStatus` 为 `running` 且 `hasDraft` 为 `true`
- **THEN** 该 APP SHALL 同时出现在 Stable tab 和 Draft tab

### Requirement: Stable Tab Badge 显示

Stable tab 中每个 APP SHALL 显示其运行时状态 Badge。

#### Scenario: running APP 显示绿色 Badge

- **WHEN** Stable tab 中一个 APP 的 `stableStatus` 为 `running`
- **THEN** SHALL 显示绿色 `running` Badge

#### Scenario: stopped APP 显示灰色 Badge

- **WHEN** Stable tab 中一个 APP 的 `stableStatus` 为 `stopped`
- **THEN** SHALL 显示灰色 `stopped` Badge

### Requirement: Draft Tab Badge 显示

Draft tab 中 SHALL 区分 Draft-only APP 和同时有 Stable 版本的 APP。

#### Scenario: Draft-only APP 的 Badge

- **WHEN** Draft tab 中一个 APP 的 `stableStatus` 为 `null`
- **THEN** SHALL 显示灰色 `draft (new)` Badge

#### Scenario: 有 Stable 版本的 Draft APP 的 Badge

- **WHEN** Draft tab 中一个 APP 的 `stableStatus` 不为 `null`
- **THEN** SHALL 显示橙色 `draft` Badge

### Requirement: 点击 APP 区分 Stable/Draft 模式

从不同 Tab 点击 APP SHALL 导航到对应模式的页面，加载对应版本的 UI。

#### Scenario: 从 Stable tab 点击进入

- **WHEN** 用户在 Stable tab 点击一个 APP
- **THEN** SHALL 导航到 `/apps/{appName}?mode=stable`
- **AND** `AppPageView` SHALL 从 `/stable/apps/{appName}/ui` 加载 UI

#### Scenario: 从 Draft tab 点击进入

- **WHEN** 用户在 Draft tab 点击一个 APP
- **THEN** SHALL 导航到 `/apps/{appName}?mode=draft`
- **AND** `AppPageView` SHALL 从 `/draft/apps/{appName}/ui` 加载 UI
