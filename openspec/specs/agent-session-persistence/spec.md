# Agent Session Persistence

## Purpose

定义 AI Agent 会话在 `platform.sqlite` 中的持久化行为，包括 SDK session 恢复、消息历史恢复，以及与 APP 生命周期联动的数据维护。

## Requirements

### Requirement: APP 级 SDK session 标识必须持久化

系统 SHALL 为每个 APP 持久化保存 Claude SDK 的 session 标识，并在该 APP 的后续对话中优先使用已保存的标识恢复上下文。

#### Scenario: Daemon 重启后恢复同一 APP 会话

- **WHEN** 用户在 APP `orders` 中已经产生过可恢复的 SDK session
- **AND** Daemon 进程重启后用户再次连接 APP `orders` 并发送消息
- **THEN** 系统 SHALL 尝试使用 `orders` 已持久化的 SDK session 标识恢复对话上下文

#### Scenario: 首次对话后保存新的 SDK session 标识

- **WHEN** 用户首次在 APP `inventory` 中完成一轮成功对话
- **THEN** 系统 SHALL 保存该轮返回的 SDK session 标识
- **AND** 后续 `inventory` 对话 SHALL 可使用该标识继续会话

### Requirement: 聊天历史必须按 APP 持久化并在连接时恢复

系统 SHALL 按 APP 持久化用户消息、assistant 最终消息和 tool 摘要消息，并在 WebSocket 连接建立后主动推送该 APP 的历史消息。

#### Scenario: 连接后收到历史消息

- **WHEN** 用户连接 APP `orders` 的 chat WebSocket
- **AND** `orders` 已存在历史聊天记录
- **THEN** 服务端 SHALL 主动发送一条 `chat:history` 消息
- **AND** `chat:history.messages` SHALL 按原始时间顺序包含 `orders` 的历史消息

#### Scenario: 历史恢复限制最近消息数量

- **WHEN** 某个 APP 的历史消息数量超过 100 条
- **THEN** 服务端发送的 `chat:history` SHALL 只包含最近 100 条消息
- **AND** 返回的消息顺序 SHALL 保持从旧到新

### Requirement: 持久化 session 数据必须跟随 APP 生命周期变化

系统 SHALL 在 APP 删除或重命名时同步维护该 APP 的 session 标识和消息历史。

#### Scenario: 删除 APP 时清理 session 数据

- **WHEN** 用户删除 APP `orders`
- **THEN** 系统 SHALL 清理 `orders` 对应的已持久化 SDK session 标识
- **AND** 系统 SHALL 清理 `orders` 对应的历史聊天消息

#### Scenario: 重命名 APP 时迁移 session 数据

- **WHEN** 用户将 APP `orders` 重命名为 `orders-v2`
- **THEN** 系统 SHALL 将原 `orders` 的已持久化 SDK session 标识迁移到 `orders-v2`
- **AND** 原 `orders` 的历史聊天消息 SHALL 一并归属到 `orders-v2`
