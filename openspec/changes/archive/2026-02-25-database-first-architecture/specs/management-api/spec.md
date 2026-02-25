## ADDED Requirements

### Requirement: 创建 APP（POST /api/v1/apps）

系统 SHALL 提供 `POST /api/v1/apps` 接口用于创建新的 APP。

Request Body：
```json
{ "name": "blog", "description": "博客系统" }
```

处理逻辑：
1. 校验 `name` 匹配 `^[a-zA-Z0-9_-]+$`
2. 校验 `name` 不与已有 APP 重复
3. 在 `apps` 表中创建记录（`current_version = 1`，`published_version = 0`）
4. 在 `app_files` 表中创建模板文件：
   - `app.yaml`（内容：`description: {description}`）
   - `migrations/001_init.sql`（内容：`-- Write your first migration here`）
   - `functions/hello.ts`（内容：示例函数模板）
5. 生成 API Key（`cb_` 前缀）
6. 返回 201 响应，包含完整 APP 信息、文件列表和 API Key

Response (201)：
```json
{
  "data": {
    "name": "blog",
    "description": "博客系统",
    "current_version": 1,
    "published_version": 0,
    "state": "draft_only",
    "files": [
      { "path": "app.yaml", "content": "description: 博客系统\n" },
      { "path": "migrations/001_init.sql", "content": "-- Write your first migration here\n" },
      { "path": "functions/hello.ts", "content": "..." }
    ],
    "api_key": "cb_xxxx..."
  }
}
```

#### Scenario: 成功创建 APP

- **WHEN** 发送 `POST /api/v1/apps` 含有效的 name 和 description
- **THEN** 系统 SHALL 返回 201，响应包含 APP 信息、模板文件和 API Key

#### Scenario: 名称重复

- **WHEN** 创建 APP 时提供的 name 已存在
- **THEN** 系统 SHALL 返回 409 错误

#### Scenario: 名称格式无效

- **WHEN** 创建 APP 时提供的 name 包含特殊字符（如空格、中文）
- **THEN** 系统 SHALL 返回 400 错误

### Requirement: 列出所有 APP（GET /api/v1/apps）

系统 SHALL 提供 `GET /api/v1/apps` 接口用于列出所有 APP 的基本信息。

Response (200)：
```json
{
  "data": [
    {
      "name": "blog",
      "description": "博客系统",
      "current_version": 3,
      "published_version": 2,
      "state": "stable_draft"
    }
  ]
}
```

`state` 字段 SHALL 基于 `published_version` 和 `current_version` 推导：
- `published_version = 0` → `"draft_only"`
- `current_version = published_version` → `"stable"`
- `current_version > published_version` → `"stable_draft"`

不返回文件内容（仅返回元信息）。

#### Scenario: 列出所有 APP

- **WHEN** 发送 `GET /api/v1/apps`
- **THEN** 系统 SHALL 返回所有 APP 的 name、description、version 信息和推导的 state

#### Scenario: 无 APP

- **WHEN** 系统中没有 APP
- **THEN** 系统 SHALL 返回空数组 `{ "data": [] }`

### Requirement: 获取 APP 详情（GET /api/v1/apps/:name）

系统 SHALL 提供 `GET /api/v1/apps/:name` 接口用于获取 APP 的完整信息，包括所有文件内容。

Response (200)：
```json
{
  "data": {
    "name": "blog",
    "description": "博客系统",
    "current_version": 3,
    "published_version": 2,
    "state": "stable_draft",
    "files": [
      { "path": "app.yaml", "content": "...", "immutable": false },
      { "path": "migrations/001_init.sql", "content": "...", "immutable": true },
      { "path": "migrations/002_add_comments.sql", "content": "...", "immutable": false },
      { "path": "functions/posts.ts", "content": "...", "immutable": false }
    ]
  }
}
```

文件列表 SHALL 包含 `immutable` 标记，使调用方知道哪些文件不可修改。

#### Scenario: 获取存在的 APP

- **WHEN** 发送 `GET /api/v1/apps/blog`，blog APP 存在
- **THEN** 系统 SHALL 返回 200，包含完整 APP 信息和所有文件内容

#### Scenario: 获取不存在的 APP

- **WHEN** 发送 `GET /api/v1/apps/nonexistent`
- **THEN** 系统 SHALL 返回 404

### Requirement: 整体更新 APP（PUT /api/v1/apps/:name）

系统 SHALL 提供 `PUT /api/v1/apps/:name` 接口用于整体更新 APP 的文件。采用 Checkout-Edit-Push 模型，配合乐观锁防止冲突。

Request Body：
```json
{
  "base_version": 3,
  "files": [
    { "path": "app.yaml", "content": "description: 博客系统\n" },
    { "path": "migrations/001_init.sql", "content": "CREATE TABLE posts..." },
    { "path": "functions/posts.ts", "content": "export async function GET(ctx)..." }
  ]
}
```

处理逻辑：
1. 校验 `base_version`：`SELECT current_version FROM apps WHERE name = ?`，不匹配返回 409
2. 校验 immutable：请求中的文件如果对应 `immutable = 1` 的记录且内容变更，返回 400
3. 计算 diff：对比请求的 files 和 DB 中当前 files
   - 新增：INSERT
   - 修改：UPDATE content
   - 删除：请求中没有但 DB 中有的非 immutable 文件 → DELETE（immutable 文件不可删）
4. 递增 `current_version`，更新 `updated_at`
5. 返回更新后的完整 APP（同 GET 格式）

Response (200): 同 `GET /api/v1/apps/:name` 格式

Error (409):
```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Version conflict: expected 3, current is 4. Please fetch and retry." } }
```

#### Scenario: 成功更新 APP

- **WHEN** 发送 `PUT /api/v1/apps/blog` 含正确的 `base_version` 和文件列表
- **THEN** 系统 SHALL 更新文件，递增 `current_version`，返回更新后的完整 APP

#### Scenario: 版本冲突

- **WHEN** 发送 `PUT /api/v1/apps/blog` 但 `base_version` 与当前 `current_version` 不匹配
- **THEN** 系统 SHALL 返回 409，包含 `VERSION_CONFLICT` 错误码

#### Scenario: 尝试修改 immutable 文件

- **WHEN** 请求中修改了 `immutable = 1` 的 migration 文件的 content
- **THEN** 系统 SHALL 返回 400 错误

#### Scenario: immutable 文件不被删除

- **WHEN** 请求的 files 列表中缺少 `immutable = 1` 的 migration 文件
- **THEN** 系统 SHALL 保留该 immutable 文件不删除

#### Scenario: 新增文件

- **WHEN** 请求中包含 DB 中不存在的新路径
- **THEN** 系统 SHALL 将新文件 INSERT 到 `app_files`

#### Scenario: 删除非 immutable 文件

- **WHEN** 请求中缺少 DB 中存在的非 immutable 文件
- **THEN** 系统 SHALL 从 `app_files` 中 DELETE 该文件

### Requirement: 单文件更新（PUT /api/v1/apps/:name/files/*）

系统 SHALL 提供 `PUT /api/v1/apps/:name/files/*` 接口用于更新或创建单个文件。

URL 中 `files/` 后的部分为文件的 `path`（如 `PUT /api/v1/apps/blog/files/functions/posts.ts`）。

Request Body：
```json
{ "content": "export async function GET(ctx) { ... }" }
```

处理逻辑：
1. 校验 immutable：若该文件 `immutable = 1` 且 content 有变更，返回 400
2. UPSERT `app_files`（存在则更新 content，不存在则创建）
3. 递增 `apps.current_version`
4. 返回更新后的文件信息

不需要 `base_version`（单文件操作的冲突概率低，且 `current_version` 会递增）。

#### Scenario: 更新已有文件

- **WHEN** 发送 `PUT /api/v1/apps/blog/files/functions/posts.ts` 含新 content
- **THEN** 系统 SHALL 更新该文件内容，递增 `current_version`

#### Scenario: 创建新文件

- **WHEN** 发送 `PUT /api/v1/apps/blog/files/functions/new.ts`，该路径在 `app_files` 中不存在
- **THEN** 系统 SHALL 创建新记录，递增 `current_version`

#### Scenario: 尝试修改 immutable 文件

- **WHEN** 发送修改 `immutable = 1` 的 migration 文件
- **THEN** 系统 SHALL 返回 400 错误

### Requirement: 删除 APP（DELETE /api/v1/apps/:name）

系统 SHALL 提供 `DELETE /api/v1/apps/:name` 接口用于物理删除 APP。

处理逻辑：
1. 删除 `app_files` 中该 APP 的所有记录（CASCADE 会自动处理）
2. 删除 `apps` 表中的记录
3. 删除 `api_keys` 表中该 APP 的记录
4. 删除 `data/apps/{appName}/` 目录（含 stable DB 和 function 文件）
5. 删除 `draft/apps/{appName}/` 目录（含 draft DB 和 function 文件）
6. 返回 200

#### Scenario: 成功删除 APP

- **WHEN** 发送 `DELETE /api/v1/apps/blog`
- **THEN** 系统 SHALL 删除所有 DB 记录和文件系统目录，返回 200

#### Scenario: 删除不存在的 APP

- **WHEN** 发送 `DELETE /api/v1/apps/nonexistent`
- **THEN** 系统 SHALL 返回 404

### Requirement: Management API 认证

Management API 的所有路由 SHALL 使用与现有 `/api/v1/apps` 路由相同的认证机制。

#### Scenario: 未认证请求

- **WHEN** 发送无认证的 Management API 请求
- **THEN** 系统 SHALL 返回 401

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

#### Scenario: 错误响应格式

- **WHEN** 任何 Management API 请求失败
- **THEN** 系统 SHALL 返回包含 `error.code` 和 `error.message` 的 JSON 响应
