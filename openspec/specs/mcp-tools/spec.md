# MCP Tools

## Purpose

Define MCP tool interfaces for AI Agent operations on apps, including create, list, fetch, update (whole and single-file), and delete, following a Checkout-Edit-Push workflow built on top of the Management API.

## Requirements

### Requirement: MCP 工具集定义

系统 SHALL 定义以下 MCP 工具接口，供 AI Agent 通过 MCP 协议操作 APP。工具实现基于 Management API 封装。

本次 change 仅定义工具接口，MCP Server 的实现在后续 change 中完成。

| Tool | 对应 API | 说明 |
|------|----------|------|
| `create_app` | POST `/api/v1/apps` | 创建 APP |
| `list_apps` | GET `/api/v1/apps` | 列出所有 APP |
| `fetch_app` | GET `/api/v1/apps/:name` | 获取完整 APP 内容 |
| `update_app` | PUT `/api/v1/apps/:name` | 整体更新 APP |
| `update_app_file` | PUT `/api/v1/apps/:name/files/*` | 更新单个文件 |
| `delete_app` | DELETE `/api/v1/apps/:name` | 删除 APP |
| `reconcile` | POST `/draft/apps/:name/reconcile` | 已有 |
| `verify` | POST `/draft/apps/:name/verify` | 已有 |
| `publish` | POST `/draft/apps/:name/publish` | 已有 |
| `query` | POST `/{mode}/apps/:name/db/sql` | 已有 |
| `get_schema` | GET `/{mode}/apps/:name/db/schema` | 已有 |

### Requirement: create_app 工具

`create_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | APP 名称 |
| `description` | string | 否 | APP 描述 |

返回创建后的完整 APP 信息，包含模板文件和版本号。

#### Scenario: Agent 创建 APP

- **WHEN** Agent 调用 `create_app(name: "blog", description: "博客系统")`
- **THEN** 工具 SHALL 调用 `POST /api/v1/apps`，返回包含 name、description、files、current_version 的结果

### Requirement: list_apps 工具

`list_apps` 工具 SHALL 不需要参数，返回所有 APP 的基本信息列表。

#### Scenario: Agent 列出 APP

- **WHEN** Agent 调用 `list_apps()`
- **THEN** 工具 SHALL 调用 `GET /api/v1/apps`，返回所有 APP 的 name、description、state、version 信息

### Requirement: fetch_app 工具

`fetch_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

返回 APP 的完整信息，包括所有文件内容和版本号。Agent 使用此工具获取 APP 快照进行编辑。

#### Scenario: Agent 获取 APP

- **WHEN** Agent 调用 `fetch_app(app_name: "blog")`
- **THEN** 工具 SHALL 调用 `GET /api/v1/apps/blog`，返回包含所有文件内容、immutable 标记和 current_version 的结果

### Requirement: update_app 工具

`update_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `base_version` | number | 是 | 基于的版本号（乐观锁） |
| `files` | array | 是 | 完整的文件列表 |

files 数组中每个元素 SHALL 包含 `path` 和 `content` 字段。

请求中缺失的非 immutable 文件将被删除。immutable 文件无论是否在请求中都会被保留。

#### Scenario: Agent 整体更新 APP

- **WHEN** Agent 先 `fetch_app` 获取 `current_version = 3`，编辑后调用 `update_app(app_name: "blog", base_version: 3, files: [...])`
- **THEN** 工具 SHALL 调用 `PUT /api/v1/apps/blog`，成功后返回更新后的完整 APP

#### Scenario: Agent 遇到版本冲突

- **WHEN** Agent 调用 `update_app` 但 `base_version` 过期
- **THEN** 工具 SHALL 返回 VERSION_CONFLICT 错误，Agent 需要重新 `fetch_app` 后重试

### Requirement: update_app_file 工具

`update_app_file` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `path` | string | 是 | 文件路径 |
| `content` | string | 是 | 文件内容 |

此工具用于快速更新单个文件，不需要传入完整文件列表和 base_version。

#### Scenario: Agent 更新单个文件

- **WHEN** Agent 调用 `update_app_file(app_name: "blog", path: "functions/posts.ts", content: "...")`
- **THEN** 工具 SHALL 调用 `PUT /api/v1/apps/blog/files/functions/posts.ts`，更新文件内容

### Requirement: delete_app 工具

`delete_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

删除 APP 的所有 DB 记录和文件系统数据。此操作不可逆。

#### Scenario: Agent 删除 APP

- **WHEN** Agent 调用 `delete_app(app_name: "blog")`
- **THEN** 工具 SHALL 调用 `DELETE /api/v1/apps/blog`，删除 APP 的所有数据

### Requirement: Checkout-Edit-Push 工作流

MCP 工具集 SHALL 支持 Checkout-Edit-Push 工作流模式，这是 Agent 操作 APP 的推荐流程：

1. **Checkout**: `fetch_app(app_name)` — 获取完整快照（含 `current_version`）
2. **Edit**: Agent 在本地/内存中编辑文件列表
3. **Push**: `update_app(app_name, base_version, files)` — 推回修改（含乐观锁）
4. **Reconcile**: `reconcile(app_name)` — 重建 Draft DB 验证 schema
5. **Verify**: `verify(app_name)` — 验证 migration 可在 Stable 上执行
6. **Publish**: `publish(app_name)` — 发布到 Stable

对于小修改，Agent 也可以使用 `update_app_file` 跳过完整的 Checkout-Edit-Push 流程。

#### Scenario: Agent 完整开发流程

- **WHEN** Agent 需要为 blog APP 添加评论功能
- **THEN** Agent SHALL 依次调用 fetch_app → 编辑 files（新增 migration 和 function）→ update_app → reconcile → verify → publish

#### Scenario: Agent 小修改流程

- **WHEN** Agent 只需要修改一个 function 文件
- **THEN** Agent SHALL 直接调用 update_app_file → reconcile
