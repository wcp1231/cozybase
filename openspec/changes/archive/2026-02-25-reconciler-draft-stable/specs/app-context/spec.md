## MODIFIED Requirements

### Requirement: AppContext per-app 资源隔离

系统 SHALL 为每个 app 创建独立的 AppContext 实例，封装该 app 的所有资源访问。AppContext 是 app 资源的唯一入口——DB 连接、路径计算、定义信息均通过 AppContext 获取。

不同 app 的 AppContext 之间 SHALL 完全隔离，不共享任何资源。

同一 App 的 Stable 和 Draft 版本 SHALL 使用不同的 AppContext 实例，分别持有各自的数据库连接。

#### Scenario: 获取 app 的 Stable 数据库连接

- **WHEN** Stable 路由 handler 需要操作 todo-app 的数据库
- **THEN** SHALL 通过 Stable AppContext 的 `db` 获取该 app 专属的 SQLite 连接，该连接指向 `data/apps/todo-app/db.sqlite`

#### Scenario: 获取 app 的 Draft 数据库连接

- **WHEN** Draft 路由 handler 需要操作 todo-app 的数据库
- **THEN** SHALL 通过 Draft AppContext 的 `db` 获取该 app 专属的 SQLite 连接，该连接指向 `draft/apps/todo-app/db.sqlite`

#### Scenario: app 之间资源隔离

- **WHEN** 同时存在 todo-app 和 blog-app 两个 AppContext
- **THEN** 两者的 `db` 属性 SHALL 指向不同的 SQLite 数据库文件，互不影响

#### Scenario: 同一 App 的 Stable/Draft 隔离

- **WHEN** todo-app 同时存在 Stable 和 Draft 版本
- **THEN** Stable AppContext 和 Draft AppContext SHALL 持有不同的数据库连接，分别指向 `data/apps/todo-app/db.sqlite` 和 `draft/apps/todo-app/db.sqlite`

### Requirement: AppContext 路径管理

每个 AppContext SHALL 提供该 app 的完整路径信息：

- `specDir` — 声明目录路径（`workspace.appsDir/{appName}`）
- `dataDir` — Stable 数据目录路径（`workspace.dataDir/apps/{appName}`）
- `dbPath` — Stable SQLite 数据库路径（`dataDir/db.sqlite`）
- `draftDataDir` — Draft 数据目录路径（`workspace.draftDir/apps/{appName}`）
- `draftDbPath` — Draft SQLite 数据库路径（`draftDataDir/db.sqlite`）

路径 SHALL 从 Workspace 的根路径派生，不允许硬编码绝对路径。

#### Scenario: 路径正确性

- **WHEN** workspace root 为 `/home/user/.cozybase`，app 名称为 `todo-app`
- **THEN** AppContext 的 `specDir` SHALL 为 `/home/user/.cozybase/apps/todo-app`，`dataDir` SHALL 为 `/home/user/.cozybase/data/apps/todo-app`，`dbPath` SHALL 为 `/home/user/.cozybase/data/apps/todo-app/db.sqlite`，`draftDataDir` SHALL 为 `/home/user/.cozybase/draft/apps/todo-app`，`draftDbPath` SHALL 为 `/home/user/.cozybase/draft/apps/todo-app/db.sqlite`

### Requirement: AppContext Hybrid 生命周期

AppContext SHALL 采用 Hybrid 策略管理生命周期，支持两种创建时机：

1. **Reconcile/Publish 时创建/更新**：Reconciler 处理某个 app 时，通过 `workspace.getOrCreateApp(name)` 创建或获取 AppContext
2. **首次请求时懒加载**：HTTP 请求中间件解析 app 时，若 AppContext 尚未创建但 `apps/{name}/app.yaml` 存在，SHALL 自动创建 AppContext

创建后的 AppContext SHALL 被缓存在 Workspace 中，后续访问直接复用。

Stable 和 Draft 版本的 AppContext SHALL 分别缓存。

#### Scenario: reconcile 时创建 AppContext

- **WHEN** Reconciler 首次处理 todo-app 的 Draft Reconcile
- **THEN** 系统 SHALL 创建 todo-app 的 Draft AppContext，初始化 Draft 数据目录，并缓存到 Workspace 中

#### Scenario: HTTP 请求时懒加载 AppContext

- **WHEN** 收到 `GET /stable/apps/todo-app/db/todos` 请求，但 todo-app 的 Stable AppContext 尚未创建
- **THEN** 中间件 SHALL 检测到 `apps/todo-app/app.yaml` 存在且 App 状态包含 Stable，创建 Stable AppContext 并缓存

#### Scenario: 不存在的 app

- **WHEN** 请求访问一个在 `apps/` 目录下不存在的 app（无 `app.yaml`）
- **THEN** 系统 SHALL 返回 404 错误

#### Scenario: Draft 版本不存在时访问 Draft 路由

- **WHEN** 收到 `GET /draft/apps/todo-app/db/todos` 请求，但 todo-app 状态为 Stable（无 Draft 变更）
- **THEN** 系统 SHALL 返回 404 错误

### Requirement: AppContext 资源关闭

AppContext SHALL 提供 `close()` 方法来释放该 app 持有的所有资源。

关闭操作 SHALL 包含：
- 关闭 SQLite 数据库连接（Stable 和/或 Draft，若已初始化）
- 将内部 DB 引用置空

调用 `close()` 后，再次访问 `db` 属性 SHALL 重新触发懒初始化。

#### Scenario: 正常关闭

- **WHEN** 调用 `appContext.close()`
- **THEN** 该 app 的 Stable 和 Draft SQLite 连接 SHALL 被关闭，释放文件锁

#### Scenario: 关闭后重新访问

- **WHEN** 调用 `close()` 后再次访问 `appContext.db`
- **THEN** 系统 SHALL 重新创建 SQLite 连接（懒初始化）

### Requirement: 中间件注入 AppContext

app-scoped 的 HTTP 请求处理 SHALL 通过中间件将 AppContext 注入到 Hono 请求 context 中。

中间件流程：
1. 从 URL 路径前缀判断是 Stable（`/stable/`）还是 Draft（`/draft/`）模式
2. 从 URL 参数提取 `appName`
3. 推导 App 状态，验证请求模式与 App 状态的兼容性
4. 调用 `workspace.getOrCreateApp(appName, mode)` 获取对应模式的 AppContext
5. 将 AppContext 设置到 `c.set('appContext', appContext)`
6. 若 app 不存在或模式不兼容，返回 404

route handler SHALL 通过 `c.get('appContext')` 获取 AppContext，不再直接依赖 DbPool。

#### Scenario: Stable 中间件成功注入

- **WHEN** 请求 `GET /stable/apps/todo-app/db/todos`
- **THEN** 中间件 SHALL 将 todo-app 的 Stable AppContext 注入到请求 context，handler 通过 `c.get('appContext').db` 访问 Stable 数据库

#### Scenario: Draft 中间件成功注入

- **WHEN** 请求 `GET /draft/apps/todo-app/db/todos`
- **THEN** 中间件 SHALL 将 todo-app 的 Draft AppContext 注入到请求 context，handler 通过 `c.get('appContext').db` 访问 Draft 数据库

#### Scenario: 模式不兼容时返回 404

- **WHEN** 请求 `GET /stable/apps/new-app/db/todos`，但 new-app 状态为 Draft only
- **THEN** 中间件 SHALL 返回 404，因为该 App 尚无 Stable 版本

## REMOVED Requirements

### Requirement: AppContext DB 连接懒初始化

**Reason**: DB 连接初始化逻辑不变（仍为懒初始化），但从独立 requirement 合并到 "AppContext per-app 资源隔离" 中，因为 Stable/Draft 双模式下 DB 连接的初始化逻辑更复杂，统一在主 requirement 中描述更清晰。

**Migration**: DB 懒初始化行为保留，实现细节参见 "AppContext per-app 资源隔离" requirement。

### Requirement: AppContext 定义更新

**Reason**: `reload(definition)` 方法在 migration-based 模型下不再需要。声明式模型中 Reconciler 需要在 diff 后更新 AppContext 的内存定义；migration-based 模型中 Draft Reconcile 是销毁重建，Publish 后 AppContext 需要完全重新创建而非部分更新。

**Migration**: Draft Reconcile 时重建 Draft AppContext；Publish 后重建 Stable AppContext。不再提供 `reload()` 方法。
