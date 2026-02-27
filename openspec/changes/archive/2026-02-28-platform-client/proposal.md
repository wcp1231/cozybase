## Why

当前 APP 的 `FunctionContext` 只能访问自身数据库，APP 之间没有标准的数据访问通道。如果要实现 Dashboard APP（聚合展示多个 APP 的数据）这类跨 APP 场景，函数只能通过 `ctx.fetch()` 发 HTTP 请求绕一大圈，且不知道自身 host/port，实际上无法工作。

需要为 FunctionContext 提供一个平台级客户端（PlatformClient），让 APP 函数可以直接调用其他 APP 的 function，形成统一的 APP 间通信模型。

## What Changes

- 在 `FunctionContext` 中新增 `platform: PlatformClient` 属性。
- `PlatformClient` 提供 `call(appName: string, fnName: string, options?: RequestInit): Promise<Response>` 方法，允许 APP 函数调用其他 APP 的 function。
- 调用路径为 Runtime 内部直接执行（不走 HTTP 网络），复用现有的函数加载和执行机制。
- 内部调用视为系统可信调用，不经过外部认证中间件。
- `PlatformClient` 同时也提供给 Daemon 使用（如未来 auth middleware 需要调用 APP function 进行鉴权）。

## Capabilities

### New Capabilities
- `platform-client`: 为 FunctionContext 提供跨 APP 函数调用能力的平台客户端。

### Modified Capabilities
- `function-runtime`: FunctionContext 增加 `platform` 属性。
- `app-runtime`: AppRegistry 需要暴露查找和执行其他 APP 函数的内部方法，供 PlatformClient 使用。

## Impact

- Affected code:
  - `packages/runtime/src/modules/functions/types.ts` — FunctionContext 类型增加 `platform`
  - `packages/runtime/src/modules/functions/context.ts` — 构建 FunctionContext 时注入 PlatformClient
  - `packages/runtime/src/platform-client.ts` — 新增 PlatformClient 实现
  - `packages/runtime/src/registry.ts` — 可能新增内部函数执行方法
  - `packages/runtime/src/index.ts` — 导出 PlatformClient 相关类型
- API impact:
  - 无新增 HTTP API。PlatformClient 是 Runtime 内部调用机制。
- Data/config impact:
  - 无新增配置或数据存储
- Risk:
  - APP 间循环调用可能导致无限递归，需要考虑调用深度限制
  - 内部调用绕过认证，需确保只有 APP function 内部才能使用 PlatformClient
