# ai-app-creation-flow Specification

## Purpose
TBD - created by archiving change ai-app-creation. Update Purpose after archive.
## Requirements
### Requirement: APP 数据模型支持 slug 与 display_name 分离

`apps` 表 SHALL 使用 `slug` 作为主键（URL 安全标识，格式 `[a-zA-Z0-9_-]+`），并包含 `display_name TEXT NOT NULL` 字段存储人类友好名称（支持中文）。所有外键字段 SHALL 使用 `app_slug` 引用 `apps(slug)`。

#### Scenario: APP 表结构包含 slug 和 display_name

- **WHEN** 系统初始化数据库
- **THEN** `apps` 表 SHALL 包含 `slug TEXT PRIMARY KEY` 和 `display_name TEXT NOT NULL` 字段
- **AND** 所有关联表的外键字段 SHALL 命名为 `app_slug` 并引用 `apps(slug)`

#### Scenario: slug 与 display_name 各司其职

- **WHEN** 创建一个显示名为 `健身追踪器` 的 APP
- **THEN** `slug` SHALL 为 URL 安全的标识（如 `fitness-tracker`）
- **AND** `display_name` SHALL 为 `健身追踪器`
- **AND** URL 路由 SHALL 使用 `slug`，UI 显示 SHALL 使用 `display_name`

### Requirement: 后端提供 AI 创建 HTTP 端点

Daemon SHALL 提供 `POST /api/v1/apps/create-with-ai` HTTP 端点。该端点接收用户自由文本描述（`idea` 字段），通过 LLM 提取结构化信息，自动完成 APP 创建。

#### Scenario: 用户通过 AI 端点成功创建 APP

- **WHEN** 前端发送 `POST /api/v1/apps/create-with-ai` 请求，body 包含 `{ "idea": "我想做一个健身追踪应用" }`
- **THEN** 端点 SHALL 调用 LLM 从文本中提取 `slug`、`displayName`、`description`
- **AND** 端点 SHALL 使用提取的信息调用 `manager.create()` 创建 APP
- **AND** 响应 SHALL 包含创建成功的 APP `slug`

#### Scenario: 缺少 idea 字段时返回错误

- **WHEN** 前端发送 `POST /api/v1/apps/create-with-ai` 请求，body 中 `idea` 为空或缺失
- **THEN** 端点 SHALL 返回 HTTP 400 错误

### Requirement: LLM 信息提取使用轻量单轮调用

AI 创建端点 SHALL 使用 `claude-agent-sdk` 的 `query()` API 配合 `claude-haiku` 模型，通过 system prompt 让模型返回结构化 JSON（包含 `slug`、`displayName`、`description`）。不注册任何 MCP 工具，纯文本提取。

#### Scenario: LLM 从用户描述中提取结构化信息

- **WHEN** 用户输入 `"我想做一个可以记录每日运动的健身追踪应用"`
- **THEN** LLM SHALL 返回包含 `slug`（如 `fitness-tracker`）、`displayName`（如 `健身追踪`）、`description` 的 JSON
- **AND** 调用 SHALL 使用 `claude-haiku` 模型以降低延迟和成本

#### Scenario: LLM 输出解析失败时 fallback

- **WHEN** LLM 返回的内容无法解析为合法 JSON
- **THEN** 系统 SHALL 尝试正则 fallback 提取字段
- **AND** 最坏情况下 SHALL 从用户输入生成默认 slug（截取前几个词并 slugify）

### Requirement: slug 冲突时自动追加后缀

当 LLM 生成的 slug 与已有 APP 冲突时，系统 SHALL 自动追加数字后缀确保唯一性。

#### Scenario: slug 冲突自动解决

- **WHEN** LLM 提取的 slug 为 `fitness-tracker`，但该 slug 已被占用
- **THEN** 系统 SHALL 尝试 `fitness-tracker-2`、`fitness-tracker-3` 直至找到可用 slug
- **AND** 最终创建的 APP SHALL 使用该可用 slug

### Requirement: APP 创建内含自动 reconcile

`manager.create()` 在创建 APP 模板文件并提交事务后 SHALL 自动调用 `DraftRebuilder.rebuild(slug)` 初始化 Draft 环境。创建流程 MUST 在模板文件中包含 `ui/pages.json`，且其初始内容 MUST 为 `{"pages": []}`，以保证页面工具可直接读取与编辑。

#### Scenario: 新建 APP 自动生成空白页面模板

- **WHEN** 通过 `manager.create()` 创建 APP `fitness-tracker`
- **THEN** 创建流程 SHALL 在 APP 目录下生成 `ui/pages.json`
- **AND** `ui/pages.json` 内容 SHALL 为 `{"pages": []}`
- **AND** 页面工具 SHALL 能基于该文件直接执行后续页面操作

#### Scenario: 新建 APP 自动拥有可访问的 Draft 页面

- **WHEN** 通过 `manager.create()` 创建 APP `fitness-tracker`
- **THEN** 创建流程 SHALL 在事务完成后自动执行 rebuild
- **AND** 前端跳转到 `/apps/fitness-tracker` 时 Draft 页面 SHALL 立即可访问

#### Scenario: reconcile 失败不回滚 APP 创建

- **WHEN** `manager.create()` 成功但后续 rebuild 失败
- **THEN** APP 记录 SHALL 保留在数据库中
- **AND** 返回值 SHALL 包含 rebuild 失败信息，前端可据此提示用户

### Requirement: 创建完成后后端先行启动 Agent

AI 创建端点在 APP 创建成功后 SHALL 通过 `chatSessionManager` 注入用户 idea 作为首条 prompt，立即启动 Agent 工作。Agent 在无 WebSocket 连接的状态下运行。

#### Scenario: Agent 在用户跳转前已开始工作

- **WHEN** AI 创建端点成功创建 APP `fitness-tracker`
- **THEN** 端点 SHALL 调用 `chatSessionManager.getOrCreate(slug).injectPrompt(idea)` 启动 Agent
- **AND** Agent SHALL 在后台运行，不依赖浏览器 WebSocket 连接
- **AND** 消息 SHALL 持久化到 SessionStore

#### Scenario: 前端连接后追赶 Agent 进度

- **WHEN** 前端跳转到 APP 页面并建立 WebSocket 连接
- **THEN** chat session SHALL 通过 `chat:history` 推送 Agent 已产生的消息
- **AND** 后续 streaming 事件 SHALL 实时推送给浏览器

### Requirement: create_app MCP 工具支持 display_name

`create_app` MCP 工具 schema SHALL 新增可选 `display_name` 参数。缺省时 `display_name` 默认为空字符串。

#### Scenario: Agent 通过 MCP 创建带 display_name 的 APP

- **WHEN** Agent 调用 `create_app` 工具，传入 `{ name: "blog", display_name: "我的博客" }`
- **THEN** 创建的 APP SHALL 以 `blog` 为 slug，`我的博客` 为 display_name

#### Scenario: MCP 创建 APP 时未传 display_name

- **WHEN** Agent 调用 `create_app` 工具，仅传入 `{ name: "blog" }`
- **THEN** 创建的 APP SHALL 以 `blog` 为 slug，display_name 默认为空字符串

### Requirement: 前端使用 displayName 作为 APP 可见名称

所有 APP UI 展示场景 SHALL 统一使用 `displayName || slug` 逻辑。`AppSummary` / `AppInfo` 类型 SHALL 包含 `displayName` 字段。

#### Scenario: APP 列表和详情页显示 displayName

- **WHEN** APP `fitness-tracker` 的 displayName 为 `健身追踪`
- **THEN** 首页 APP 列表、侧边栏、APP 页面标题 SHALL 显示 `健身追踪`

#### Scenario: displayName 为空时 fallback 到 slug

- **WHEN** APP `blog` 的 displayName 为空字符串
- **THEN** UI SHALL 显示 `blog` 作为可见名称

### Requirement: 前端 CreateAppDialog 对接 AI 创建端点

`CreateAppDialog` 组件 SHALL 向 `POST /api/v1/apps/create-with-ai` 发送用户输入的 idea，成功后自动导航到新 APP 编辑页面。

#### Scenario: 用户通过 Dialog 创建 APP 并跳转

- **WHEN** 用户在 CreateAppDialog 中输入描述并点击 "AI 创建"
- **THEN** 组件 SHALL 调用 `POST /api/v1/apps/create-with-ai`
- **AND** 成功后 SHALL 关闭 Dialog 并导航到 `/apps/<slug>`
- **AND** 用户到达 APP 页面时 Agent SHALL 已在后台工作

#### Scenario: AI 创建失败时显示错误

- **WHEN** AI 创建端点返回错误
- **THEN** Dialog SHALL 展示错误信息
- **AND** 用户可以修改描述后重新提交

