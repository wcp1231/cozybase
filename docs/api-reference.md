# REST API 参考

Base URL: `http://localhost:3000`

所有响应均为 JSON 格式。

## 平台接口

### GET /health

健康检查。

**Response:**

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### GET /api/v1/status

获取 daemon 状态和所有 App 信息。

**Response:**

```json
{
  "status": "running",
  "version": "0.1.0",
  "workspace": "/path/to/my-workspace",
  "apps": [
    {
      "name": "todo-app",
      "description": "A simple todo application",
      "tables": ["todos", "users"],
      "functions": [],
      "resources": [
        {
          "app_name": "todo-app",
          "resource_type": "table",
          "resource_name": "todos",
          "spec_hash": "a1b2c3...",
          "applied_at": "2025-01-01 00:00:00"
        }
      ]
    }
  ]
}
```

### POST /api/v1/reconcile

手动触发全量 workspace reconcile。

**Response:**

```json
{
  "changes": [
    {
      "app": "todo-app",
      "type": "alter_table",
      "resource": "todos",
      "detail": "+column: priority"
    }
  ]
}
```

`type` 可能的值: `create_app`, `create_table`, `alter_table`, `orphan_table`, `create_index`, `drop_index`

---

## App 数据接口

所有路径前缀: `/api/v1/app/:appName/db`

`:appName` 必须是 workspace 中存在的 App 目录名。如果 App 不存在，返回 404。

### GET /schema

获取 App 数据库中所有表的 schema 信息（只读）。

**Response:**

```json
{
  "data": {
    "todos": {
      "columns": [
        { "cid": 0, "name": "id", "type": "TEXT", "notnull": 0, "dflt_value": null, "pk": 1 },
        { "cid": 1, "name": "title", "type": "TEXT", "notnull": 1, "dflt_value": null, "pk": 0 }
      ],
      "foreignKeys": [],
      "indexes": [
        { "seq": 0, "name": "idx_todos_completed", "unique": 0, "origin": "c", "partial": 0 }
      ]
    }
  }
}
```

### POST /sql

执行原始 SQL 语句。

**Request:**

```json
{
  "sql": "SELECT * FROM todos WHERE completed = ?",
  "params": [0]
}
```

**Response (SELECT):**

```json
{
  "data": {
    "columns": ["id", "title", "completed", "created_at"],
    "rows": [
      { "id": "abc123", "title": "Buy milk", "completed": 0, "created_at": "2025-01-01" }
    ]
  }
}
```

**Response (INSERT/UPDATE/DELETE):**

```json
{
  "data": {
    "changes": 1,
    "lastInsertRowid": 0
  }
}
```

**安全限制:** 以下语句被禁止执行：
- `ATTACH DATABASE`
- `DETACH DATABASE`
- `LOAD_EXTENSION`

### GET /:table

列出表中的记录，支持过滤、排序、分页。

**Query 参数:**

| 参数 | 格式 | 示例 | 说明 |
|------|------|------|------|
| `select` | `col1,col2,...` | `select=id,title` | 指定返回的列 |
| `where` | `column.op.value` | `where=completed.eq.0` | 过滤条件，可多个 |
| `order` | `column.direction` | `order=created_at.desc` | 排序，可多列用逗号分隔 |
| `limit` | number | `limit=20` | 限制返回行数，默认 1000 |
| `offset` | number | `offset=40` | 跳过前 N 行，用于分页 |

**Where 操作符:**

| 操作符 | SQL 等价 | 示例 |
|--------|----------|------|
| `eq` | `=` | `where=status.eq.active` |
| `neq` | `!=` | `where=status.neq.deleted` |
| `gt` | `>` | `where=age.gt.18` |
| `gte` | `>=` | `where=score.gte.60` |
| `lt` | `<` | `where=price.lt.100` |
| `lte` | `<=` | `where=count.lte.5` |
| `like` | `LIKE` | `where=name.like.%john%` |
| `ilike` | `LIKE` (case-insensitive) | `where=name.ilike.%john%` |
| `is` | `IS` | `where=deleted_at.is.null` |
| `in` | `IN` | `where=status.in.active,pending` |

多个 where 条件用 AND 连接：
```
?where=status.eq.active&where=age.gt.18
```

**Response:**

```json
{
  "data": [
    { "id": "abc123", "title": "Buy milk", "completed": 0 }
  ],
  "meta": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

`meta.total` 是满足 where 条件的总记录数（不受 limit/offset 影响），用于分页。

### GET /:table/:id

按主键获取单条记录。

**Response (200):**

```json
{
  "data": { "id": "abc123", "title": "Buy milk", "completed": 0 }
}
```

**Response (404):**

```json
{
  "error": { "code": "NOT_FOUND", "message": "Record not found in 'todos' with id='xyz'" }
}
```

### POST /:table

创建新记录。

如果表有 `id` 列（作为主键）且请求体中未提供 `id`，会自动生成 12 位 nanoid。

**Request:**

```json
{
  "title": "Buy milk",
  "completed": 0
}
```

**Response (201):**

```json
{
  "data": {
    "id": "7CjtxLciOrxD",
    "title": "Buy milk",
    "completed": 0,
    "created_at": "2025-01-01 12:00:00"
  }
}
```

响应中包含所有列的值（含 `DEFAULT` 生成的值）。

### PATCH /:table/:id

更新指定记录的部分字段。

**Request:**

```json
{
  "completed": 1
}
```

**Response (200):**

```json
{
  "data": {
    "id": "7CjtxLciOrxD",
    "title": "Buy milk",
    "completed": 1,
    "created_at": "2025-01-01 12:00:00"
  }
}
```

### DELETE /:table/:id

删除指定记录。

**Response (200):**

```json
{
  "success": true
}
```

---

## 错误响应

所有错误使用统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

| HTTP Status | Code | 场景 |
|-------------|------|------|
| 400 | `BAD_REQUEST` | 无效参数、SQL 语法错误、无效表名 |
| 401 | `UNAUTHORIZED` | 未提供认证凭据 |
| 403 | `FORBIDDEN` | 权限不足 |
| 404 | `NOT_FOUND` | App/表/记录不存在 |
| 409 | `CONFLICT` | 唯一约束冲突 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端错误 |

## 表名限制

API 层面的表名验证规则：

- 必须匹配 `[a-zA-Z_][a-zA-Z0-9_]*`
- 不允许以 `_` 开头（内部表保留）
- 不允许以 `sqlite_` 开头（SQLite 系统表保留）

## 变更事件

所有 CRUD 操作会通过 EventBus 发布变更事件：

```
Topic:  db:{appName}:{tableName}
Event:  {
  appId: string,      // App 名称
  table: string,      // 表名
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  record: object,     // 当前记录
  oldRecord?: object  // 变更前记录 (UPDATE/DELETE)
}
```

这些事件将在 Realtime 模块实现后通过 WebSocket 推送给客户端。
