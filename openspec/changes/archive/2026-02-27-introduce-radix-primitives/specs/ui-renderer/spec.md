## MODIFIED Requirements

### Requirement: SchemaRenderer 入口组件

SchemaRenderer 的渲染职责不变。样式实现 SHALL 从 inline style 切换为 Tailwind utility class。

SchemaRenderer 内部的 DialogLayer SHALL 使用 `CzDialog` Primitive 渲染弹窗，替代当前的手写 `<div>` 固定定位实现。未知组件错误占位符、ErrorBoundary 等 SHALL 继续使用 Tailwind class 定义样式。

DialogLayer SHALL 以受控模式使用 `CzDialog`：对 dialog stack 中的每个 entry，渲染 `<CzDialog open={true} onOpenChange={...}>`，其中 `onOpenChange(false)` 调用 `PageContext.closeDialog()`。

#### Scenario: DialogLayer 使用 CzDialog Primitive

- **WHEN** SchemaRenderer 渲染 DialogLayer 中的弹窗
- **THEN** 每个弹窗 SHALL 使用 `CzDialogContent` 渲染，自动具有 focus trap、Escape 关闭、Portal 渲染和 `aria-modal="true"`

#### Scenario: DialogLayer 多层弹窗

- **WHEN** dialog stack 中有两个弹窗 [A, B]
- **THEN** 两个弹窗 SHALL 各自使用独立的 `CzDialog` 渲染，B 在 A 之上显示，每个维护独立的 focus trap

#### Scenario: 未知组件错误使用 Tailwind class

- **WHEN** 遇到未注册的组件类型
- **THEN** 错误占位符 SHALL 使用语义色 Tailwind class（如 `bg-error-bg text-error-text border border-error-border`）渲染

#### Scenario: ErrorBoundary 使用 Tailwind class

- **WHEN** 组件渲染抛出异常
- **THEN** ErrorBoundary 的 fallback UI SHALL 使用 Tailwind class 渲染

### Requirement: ActionDispatcher 行为派发器

系统 SHALL 提供 ActionDispatcher 模块，负责执行 ActionSchema 声明的行为。

ActionDispatcher SHALL 接收以下参数：
- `action: ActionSchema | ActionSchema[]` — 要执行的 action
- `context: ActionContext` — 执行上下文（包含 baseUrl、当前可用的 expression context、PageContext 引用）

ActionDispatcher SHALL 依次处理以下 action 类型：

**api**: 使用 `fetch()` 发起 HTTP 请求。URL SHALL 以 `baseUrl` 为前缀自动补全。请求体和 URL 中的 expression SHALL 在发送前解析。请求完成后，根据结果执行 `onSuccess` 或 `onError` 中的 action 链。

**reload**: 通知 PageContext 中 `target` 对应的组件重新获取数据。

**dialog**: 在 PageContext 中注册一个弹窗，将 `body` 的 ComponentSchema 作为弹窗内容渲染。

**link**: 执行页面内导航或外部跳转。

**close**: 关闭当前弹窗上下文。

**confirm**: SHALL 使用 `CzAlertDialog` Primitive 渲染确认弹窗，替代当前的 `window.confirm()` 或手写弹窗。确认弹窗 SHALL 具有 `role="alertdialog"`，点击 Overlay 不关闭，用户 MUST 明确选择"确认"或"取消"。用户确认后执行 `onConfirm`，取消后执行 `onCancel`（如有）。

当 action 为数组时，SHALL 按顺序依次执行。前一个 action 失败时 SHALL 中断后续执行（api action 的失败走 onError 路径，不中断数组执行）。

#### Scenario: api action 请求

- **WHEN** 执行 `{ "type": "api", "method": "POST", "url": "/db/todo", "body": { "title": "新任务" } }`，baseUrl 为 `/stable/apps/welcome`
- **THEN** ActionDispatcher SHALL 发起 `POST /stable/apps/welcome/db/todo` 请求，body 为 `{ "title": "新任务" }`

#### Scenario: api action URL 自动补全

- **WHEN** action url 为 `/db/todo`，baseUrl 为 `/stable/apps/welcome`
- **THEN** ActionDispatcher SHALL 将请求 URL 补全为 `/stable/apps/welcome/db/todo`

#### Scenario: api action onSuccess 链

- **WHEN** api 请求成功，onSuccess 为 `[{ "type": "reload", "target": "table1" }, { "type": "close" }]`
- **THEN** ActionDispatcher SHALL 先触发 table1 的 reload，再关闭弹窗

#### Scenario: reload action

- **WHEN** 执行 `{ "type": "reload", "target": "todo-table" }`
- **THEN** ActionDispatcher SHALL 通知 PageContext 中 id 为 `todo-table` 的组件重新执行其 `api` 配置获取最新数据

#### Scenario: dialog action

- **WHEN** 执行 `{ "type": "dialog", "title": "编辑", "body": { "type": "form", ... } }`
- **THEN** ActionDispatcher SHALL 打开一个弹窗，标题为"编辑"，内容为 body 中的 form 组件

#### Scenario: confirm action 使用 CzAlertDialog

- **WHEN** 执行 confirm action
- **THEN** ActionDispatcher SHALL 使用 `CzAlertDialog` 渲染确认弹窗，弹窗具有 `role="alertdialog"`，点击 Overlay 不关闭

#### Scenario: confirm action 用户确认

- **WHEN** 执行 confirm action，用户点击"确认"按钮
- **THEN** ActionDispatcher SHALL 执行 `onConfirm` 中的 action

#### Scenario: confirm action 用户取消

- **WHEN** 执行 confirm action，用户点击"取消"按钮
- **THEN** ActionDispatcher SHALL 不执行 `onConfirm`，执行 `onCancel`（如有定义）

#### Scenario: action 数组顺序执行

- **WHEN** 执行 action 数组 `[actionA, actionB, actionC]`
- **THEN** ActionDispatcher SHALL 按顺序执行 actionA → actionB → actionC
