# Page Schema Validation

## Purpose

定义 `ui/pages.json` 在引入 URL 路径模式后，对页面路径字段执行的结构与语义校验规则，确保页面数组既能稳定匹配路由，又能继续支持现有组件 ID 与引用校验能力。

## MODIFIED Requirements

### Requirement: 页面 schema 使用显式路径字段与数组顺序

系统 SHALL 继续使用 `pages[]` 数组承载页面定义。每个页面对象 MUST 显式包含 `path`、`title` 与 `body` 字段，系统 MUST NOT 改用以路径为 key 的对象结构作为 canonical schema。

#### Scenario: 合法页面对象通过结构校验

- **WHEN** `ui/pages.json` 中某页面定义为 `{ "path": "orders/:orderId", "title": "订单详情", "body": [] }`
- **THEN** 系统 SHALL 认定该页面满足基础结构要求

#### Scenario: 缺少 path 字段时被拒绝

- **WHEN** `ui/pages.json` 中某页面缺少 `path` 字段
- **THEN** 系统 SHALL 拒绝该页面结构
- **AND** 返回结果 SHALL 指明页面路径字段缺失

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
