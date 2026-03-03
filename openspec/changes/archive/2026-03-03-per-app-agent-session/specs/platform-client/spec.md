# Platform Client

## ADDED Requirements

### Requirement: 前端聊天 store 必须按 activeApp 切换 Agent 连接

前端聊天 store SHALL 暴露 `activeApp` 状态和 `setActiveApp(appName | null)` 操作。`setActiveApp` 在 APP 变化时 SHALL 断开旧 WebSocket、清空本地消息，并根据新的 APP 重新建立或停止连接。

#### Scenario: 切换到新的 APP 时重建连接

- **WHEN** 当前聊天 store 已连接 APP `orders`
- **AND** 页面切换并调用 `setActiveApp('inventory')`
- **THEN** store SHALL 先断开 `orders` 的 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store SHALL 建立新的 `/api/v1/chat/ws?app=inventory` 连接

#### Scenario: activeApp 变为 null 时停止聊天连接

- **WHEN** 页面进入 Home 模式或 Builder 列表页并调用 `setActiveApp(null)`
- **THEN** store SHALL 断开当前 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store MUST NOT 自动建立新的 chat WebSocket 连接

### Requirement: 前端必须处理按 APP 恢复的历史消息

前端聊天 store SHALL 识别 `chat:history` 消息，并使用服务端返回的历史消息初始化当前 APP 的聊天记录。

#### Scenario: 建立连接后恢复历史记录

- **WHEN** 前端收到某个 APP 的 `chat:history` 消息
- **THEN** store SHALL 用 `chat:history.messages` 初始化当前消息列表
- **AND** 后续新的 assistant 或 tool 消息 SHALL 追加到该列表之后

### Requirement: ChatPanel 必须根据页面上下文展示三态 UI

ChatPanel SHALL 按页面上下文区分 Home 模式、Builder 列表页和 Builder APP 页三种展示状态。

#### Scenario: Home 模式显示占位 UI

- **WHEN** 当前页面处于 Home 模式
- **THEN** ChatPanel SHALL 显示占位 UI 框架
- **AND** ChatPanel MUST NOT 建立可发送消息的 APP chat 会话

#### Scenario: Builder 列表页提示先选择 APP

- **WHEN** 当前页面处于 Builder 模式且尚未选中具体 APP
- **THEN** ChatPanel SHALL 显示“请先选择应用”一类的提示信息
- **AND** ChatPanel MUST NOT 发送聊天消息到后端

#### Scenario: Builder APP 页启用正常聊天

- **WHEN** 当前页面处于 Builder 模式且已选中 APP `orders`
- **THEN** ChatPanel SHALL 显示 `orders` 的聊天历史和输入框
- **AND** 用户发送的消息 SHALL 通过 `orders` 对应的 chat WebSocket 发送到后端

### Requirement: AppLayout 必须同步路由上下文到 activeApp

前端页面布局层 SHALL 监听当前路由的 `mode` 和 `appName`，并据此同步聊天 store 的 `activeApp`。

#### Scenario: 进入 Builder APP 页时设置 activeApp

- **WHEN** 用户进入 Builder 模式下的 APP 页面 `/draft/apps/orders/...`
- **THEN** AppLayout SHALL 调用 `setActiveApp('orders')`
- **AND** 聊天 store SHALL 连接到 `orders` 的 chat WebSocket

#### Scenario: 离开 Builder APP 页时清空 activeApp

- **WHEN** 用户从 Builder APP 页返回 Builder 列表页或切换到 Home 模式
- **THEN** AppLayout SHALL 调用 `setActiveApp(null)`
- **AND** 聊天 store SHALL 停止当前 APP 的 chat 连接
