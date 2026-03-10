## ADDED Requirements

### Requirement: Operator Agent 通过 PlatformClient 访问 Stable APP 能力

daemon 的 OperatorSession SHALL 通过 `PlatformClient` 接口调用目标 APP 的 Stable 运行时，作为 Operator Agent tools 的执行后端。

- OperatorSession 创建时 daemon SHALL 为其注入一个 `callApi` 回调，内部通过 `PlatformClient.call(appSlug, path, options)` 实现
- 所有 Operator tool 的 REST API 调用 SHALL 经由此回调执行，固定使用 `stable` mode
- 该调用 SHALL 复用 PlatformClient 已有的同进程路由、循环调用保护和免认证机制

#### Scenario: Operator tool 通过 PlatformClient 查询数据

- **WHEN** Operator Agent 的 `query_data` tool 需要查询 APP `allergen-tracker` 的 `allergens` 表
- **THEN** tool 的 `callApi` 回调 SHALL 通过 `PlatformClient.call('allergen-tracker', '_db/tables/allergens?limit=10')` 执行
- **AND** PlatformClient SHALL 将请求路由到 `GET /stable/apps/allergen-tracker/fn/_db/tables/allergens?limit=10`

#### Scenario: Operator tool 通过 PlatformClient 调用自定义 function

- **WHEN** Operator Agent 的 `call_function` tool 需要调用 `POST /fn/mark-allergen`
- **THEN** tool 的 `callApi` 回调 SHALL 通过 `PlatformClient.call('allergen-tracker', 'mark-allergen', { method: 'POST', body: ... })` 执行

#### Scenario: 目标 APP 未 publish

- **WHEN** Operator tool 尝试调用一个尚未 publish（没有 Stable 版本）的 APP
- **THEN** PlatformClient SHALL 返回 HTTP 404 Response
- **AND** tool SHALL throw Error 说明该 APP 尚无 Stable 运行时

### Requirement: Operator Agent 可获取 APP 自定义 function 列表

daemon SHALL 提供一种方式让 Operator Agent 在构建 system prompt 时获取 APP 当前已注册的自定义 function 路由列表。

- 该列表 SHALL 包含 function 名称和支持的 HTTP 方法
- 该信息 SHALL 从 Stable APP 的运行时获取，反映已 publish 的 function 集合

#### Scenario: 获取包含自定义 function 的列表

- **WHEN** OperatorSession 构建 system prompt 时查询 APP `allergen-tracker` 的 function 列表
- **THEN** SHALL 返回已注册的自定义 function 路由信息（如 `mark-allergen`、`adjust-inventory`）

#### Scenario: APP 没有自定义 function

- **WHEN** APP 只有 auto CRUD 路由，没有 `functions/` 目录
- **THEN** function 列表查询 SHALL 返回空列表
