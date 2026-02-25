# Capability: App Context

## Purpose

Provide per-app resource isolation through the AppContext abstraction. Each app gets its own AppContext instance that encapsulates database connections, path management, and definition information. AppContext serves as the single entry point for all app-scoped resource access.

## Requirements

### Requirement: AppContext per-app 资源隔离

系统 SHALL 为每个 app 创建独立的 AppContext 实例，封装该 app 的所有资源访问。AppContext 是 app 资源的唯一入口——DB 连接、路径计算、定义信息均通过 AppContext 获取。

不同 app 的 AppContext 之间 SHALL 完全隔离，不共享任何资源。

#### Scenario: 获取 app 的数据库连接

- **WHEN** route handler 需要操作 todo-app 的数据库
- **THEN** SHALL 通过 `appContext.db` 获取该 app 专属的 SQLite 连接，该连接指向 `data/apps/todo-app/db.sqlite`

#### Scenario: app 之间资源隔离

- **WHEN** 同时存在 todo-app 和 blog-app 两个 AppContext
- **THEN** 两者的 `db` 属性 SHALL 指向不同的 SQLite 数据库文件，互不影响

### Requirement: AppContext 路径管理

每个 AppContext SHALL 提供该 app 的完整路径信息：

- `specDir` — 声明目录路径（`workspace.appsDir/{appName}`）
- `dataDir` — 数据目录路径（`workspace.dataDir/apps/{appName}`）
- `dbPath` — SQLite 数据库路径（`dataDir/db.sqlite`）

路径 SHALL 从 Workspace 的根路径派生，不允许硬编码绝对路径。

#### Scenario: 路径正确性

- **WHEN** workspace root 为 `/home/user/.cozybase`，app 名称为 `todo-app`
- **THEN** AppContext 的 `specDir` SHALL 为 `/home/user/.cozybase/apps/todo-app`，`dataDir` SHALL 为 `/home/user/.cozybase/data/apps/todo-app`，`dbPath` SHALL 为 `/home/user/.cozybase/data/apps/todo-app/db.sqlite`

### Requirement: AppContext Hybrid 生命周期

AppContext SHALL 采用 Hybrid 策略管理生命周期，支持两种创建时机：

1. **Reconcile 时创建/更新**：Reconciler 处理某个 app 时，通过 `workspace.getOrCreateApp(name)` 创建或获取 AppContext
2. **首次请求时懒加载**：HTTP 请求中间件解析 app 时，若 AppContext 尚未创建但 `apps/{name}/app.yaml` 存在，SHALL 自动创建 AppContext

创建后的 AppContext SHALL 被缓存在 Workspace 的 apps Map 中，后续访问直接复用。

#### Scenario: reconcile 时创建 AppContext

- **WHEN** Reconciler 首次处理 todo-app
- **THEN** 系统 SHALL 创建 todo-app 的 AppContext，初始化数据目录，并缓存到 Workspace 中

#### Scenario: HTTP 请求时懒加载 AppContext

- **WHEN** 收到 `GET /api/v1/app/todo-app/db/todos` 请求，但 todo-app 尚未被 reconcile
- **THEN** 中间件 SHALL 检测到 `apps/todo-app/app.yaml` 存在，创建 AppContext 并缓存，后续 handler 正常使用 `appContext.db`

#### Scenario: 重复访问使用缓存

- **WHEN** todo-app 的 AppContext 已被创建后，再次请求该 app 的资源
- **THEN** 系统 SHALL 返回已缓存的 AppContext 实例，不重复创建

#### Scenario: 不存在的 app

- **WHEN** 请求访问一个在 `apps/` 目录下不存在的 app（无 `app.yaml`）
- **THEN** 系统 SHALL 返回 404 错误

### Requirement: AppContext DB 连接懒初始化

AppContext 的 SQLite 数据库连接 SHALL 采用懒初始化策略——仅在首次访问 `db` 属性时才创建连接和数据目录。

初始化步骤：
1. 创建 `data/apps/{appName}/` 目录（若不存在）
2. 打开 SQLite 连接（指向 `data/apps/{appName}/db.sqlite`）
3. 设置 WAL 模式和 foreign keys

#### Scenario: 首次访问时初始化 DB

- **WHEN** 首次访问 `appContext.db`
- **THEN** 系统 SHALL 自动创建数据目录、打开 SQLite 连接并配置 WAL 模式

#### Scenario: 数据目录和 DB 文件自动创建

- **WHEN** `data/apps/todo-app/` 目录不存在时访问 `appContext.db`
- **THEN** 系统 SHALL 自动创建该目录和 `db.sqlite` 文件

### Requirement: AppContext 定义更新

AppContext SHALL 支持通过 `reload(definition)` 方法更新 app 的声明定义，用于 reconcile 过程中重新加载修改后的 YAML 定义。

reload SHALL 更新内存中的 definition 引用，不关闭或重建 DB 连接。

#### Scenario: reconcile 时更新定义

- **WHEN** 用户修改了 `apps/todo-app/tables/todos.yaml` 后触发 reconcile
- **THEN** Reconciler SHALL 调用 `appContext.reload(newDefinition)` 更新该 AppContext 的定义信息

### Requirement: AppContext 资源关闭

AppContext SHALL 提供 `close()` 方法来释放该 app 持有的所有资源。

关闭操作 SHALL 包含：
- 关闭 SQLite 数据库连接（若已初始化）
- 将内部 DB 引用置空

调用 `close()` 后，再次访问 `db` 属性 SHALL 重新触发懒初始化。

#### Scenario: 正常关闭

- **WHEN** 调用 `appContext.close()`
- **THEN** 该 app 的 SQLite 连接 SHALL 被关闭，释放文件锁

#### Scenario: 关闭后重新访问

- **WHEN** 调用 `close()` 后再次访问 `appContext.db`
- **THEN** 系统 SHALL 重新创建 SQLite 连接（懒初始化）

### Requirement: 中间件注入 AppContext

app-scoped 的 HTTP 请求处理 SHALL 通过中间件将 AppContext 注入到 Hono 请求 context 中。

中间件流程：
1. 从 URL 参数提取 `appName`
2. 调用 `workspace.getOrCreateApp(appName)` 获取 AppContext
3. 将 AppContext 设置到 `c.set('appContext', appContext)`
4. 若 app 不存在，返回 404

route handler SHALL 通过 `c.get('appContext')` 获取 AppContext，不再直接依赖 DbPool。

#### Scenario: 中间件成功注入

- **WHEN** 请求 `GET /api/v1/app/todo-app/db/todos`
- **THEN** 中间件 SHALL 将 todo-app 的 AppContext 注入到请求 context，handler 通过 `c.get('appContext').db` 访问数据库

#### Scenario: route handler 使用 AppContext

- **WHEN** DB route handler 需要执行查询
- **THEN** handler SHALL 从 `c.get('appContext').db` 获取数据库连接，不使用 DbPool
