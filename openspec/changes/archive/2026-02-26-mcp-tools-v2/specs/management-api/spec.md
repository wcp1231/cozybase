## ADDED Requirements

### Requirement: SQL 查询端点（POST /{mode}/apps/{appName}/db/_sql）

系统 SHALL 提供 `POST /{mode}/apps/{appName}/db/_sql` 端点，用于在 APP 的数据库上执行 SQL 查询。此端点供 `cozybase mcp` 的远程模式（RemoteBackend）调用。

Request Body：
```json
{ "sql": "SELECT * FROM tasks WHERE completed = 0" }
```

端点 SHALL 执行 SQL 分类检查和权限控制：

| 语句类型 | Draft 模式 | Stable 模式 |
|---------|-----------|-------------|
| SELECT / WITH / EXPLAIN | 允许 | 允许 |
| PRAGMA（只读类） | 允许 | 允许 |
| INSERT / UPDATE / DELETE / REPLACE | 允许 | 禁止 |
| CREATE / DROP / ALTER | 禁止 | 禁止 |
| 其他 | 禁止 | 禁止 |

**安全措施：**
- SHALL 拒绝包含分号分隔的多条语句
- 结果集 SHALL 最多返回 1000 行
- 执行超时 SHALL 为 5 秒

Response (200)：
```json
{
  "columns": ["id", "title", "completed"],
  "rows": [[1, "Buy milk", 0], [2, "Read book", 1]],
  "rowCount": 2
}
```

#### Scenario: Draft 模式执行 SELECT
- **WHEN** 发送 `POST /draft/apps/todo/db/_sql` 含 `{ "sql": "SELECT * FROM tasks" }`
- **THEN** 系统 SHALL 返回 200，包含查询结果的 columns、rows 和 rowCount

#### Scenario: Draft 模式执行 DML
- **WHEN** 发送 `POST /draft/apps/todo/db/_sql` 含 `{ "sql": "INSERT INTO tasks (title) VALUES ('test')" }`
- **THEN** 系统 SHALL 执行插入并返回 200

#### Scenario: Stable 模式拒绝 DML
- **WHEN** 发送 `POST /stable/apps/todo/db/_sql` 含 `{ "sql": "DELETE FROM tasks WHERE id = 1" }`
- **THEN** 系统 SHALL 返回 403，包含 `SQL_NOT_ALLOWED` 错误码

#### Scenario: 拒绝 DDL 语句
- **WHEN** 发送 `POST /draft/apps/todo/db/_sql` 含 `{ "sql": "DROP TABLE tasks" }`
- **THEN** 系统 SHALL 返回 403，包含 `SQL_NOT_ALLOWED` 错误码

#### Scenario: 拒绝多语句
- **WHEN** 发送 `POST /draft/apps/todo/db/_sql` 含 `{ "sql": "SELECT 1; DROP TABLE tasks" }`
- **THEN** 系统 SHALL 返回 400，包含错误信息

#### Scenario: 结果集大小限制
- **WHEN** SELECT 查询返回超过 1000 行
- **THEN** 系统 SHALL 仅返回前 1000 行

## MODIFIED Requirements

### Requirement: Management API 错误格式

Management API 的错误响应 SHALL 使用统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误信息"
  }
}
```

错误码 SHALL 包括：
- `VERSION_CONFLICT` — 乐观锁冲突（409）
- `IMMUTABLE_FILE` — 尝试修改 immutable 文件（400）
- `INVALID_NAME` — 名称格式无效（400）
- `NOT_FOUND` — APP 不存在（404）
- `ALREADY_EXISTS` — APP 名称已存在（409）
- `SQL_NOT_ALLOWED` — SQL 语句类型不允许执行（403）
- `SQL_INVALID` — SQL 语句格式无效（如多语句）（400）

#### Scenario: 错误响应格式
- **WHEN** 任何 Management API 请求失败
- **THEN** 系统 SHALL 返回包含 `error.code` 和 `error.message` 的 JSON 响应

#### Scenario: SQL 执行权限错误
- **WHEN** 在 Stable 模式执行 DML 语句或在任何模式执行 DDL 语句
- **THEN** 系统 SHALL 返回 403，error.code 为 `SQL_NOT_ALLOWED`

#### Scenario: SQL 格式错误
- **WHEN** 提交包含多条语句的 SQL
- **THEN** 系统 SHALL 返回 400，error.code 为 `SQL_INVALID`
