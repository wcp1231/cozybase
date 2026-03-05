## Context

当前 Agent 通过 MCP 工具操作 APP UI，核心数据结构是 `ui/pages.json`。现有 6 个 `page_*` 工具（outline/get/insert/update/move/delete）只能操作 page 内的组件节点，无法操作 page 本身。Agent 添加页面时被迫直接编辑 JSON 文件，且 `create_app` 不生成 `ui/pages.json`，Agent 需从零手写该文件。

相关代码：
- `page-editor.ts`：核心编辑逻辑，所有读写操作都经过 normalize → validate → write 管线
- `server.ts`：MCP 工具注册
- `handlers.ts`：MCP handler 层，桥接工具输入和 page-editor 函数
- `mcp-types.ts`：工具描述和 input schema 定义
- `manager.ts`：APP 创建逻辑，当前模板只包含 `app.yaml` 和 `functions/hello.ts`

## Goals / Non-Goals

**Goals:**
- 让 Agent 通过 MCP 工具完成所有 UI 操作，不再需要手动编辑 `pages.json`
- 清晰区分页面级操作（`pages_*`）和组件级操作（`ui_*`）
- 新 APP 创建后立即拥有合法的 `ui/pages.json` 文件

**Non-Goals:**
- 不支持修改 page id（影响路由，复杂度高）
- 不引入页面模板/预设布局系统
- 不修改前端渲染逻辑或 backend 数据模型
- 不做旧 Agent 指令的向后兼容（直接切换到新工具名）

## Decisions

### Decision 1: 工具命名采用 `pages_*` / `ui_*` 双前缀方案

`pages_*` 操作页面集合（对应 `pages.json` 中的 `pages[]` 数组），`ui_*` 操作页面内的组件树节点。

**备选方案：**
- `ui_add_page` / `ui_insert`（统一 `ui_` 前缀 + 动词后缀区分）——动词区分不够直观，容易混淆
- `page_add` / `node_insert`（page vs node）——`node` 太抽象，Agent 不容易理解

**选择理由：** `pages` 复数暗示操作的是"页面列表"，和 `pages.json` 概念一致；`ui` 更通用，指代组件树中的节点。两组前缀在视觉和语义上都清晰分离。

### Decision 2: Page-level 函数复用 page-editor.ts 的读写管线

新增的 `addPage`、`removePage`、`updatePageMeta`、`reorderPage` 函数放在 `page-editor.ts` 中，复用现有的 `readPagesJson()` / `writePagesJson()` 管线。

**理由：** 所有对 `pages.json` 的读写都经过同一条 normalize → validate → write 路径，保证数据一致性。Page-level 操作本质上是对 `data.pages[]` 数组的增删改排序，逻辑简单，不需要独立模块。

### Decision 3: `pages_list` 复用 `readPagesJson()` 而非新增独立查询

`pages_list` 直接调用 `readPagesJson()` 后提取 `pages.map(p => ({ id: p.id, title: p.title }))`，不需要独立的轻量读取路径。

**理由：** `readPagesJson()` 已包含缓存逻辑（normalize 后写回磁盘避免重复处理），额外开一条读取路径收益不大，且会增加维护成本。

### Decision 4: `pages_add` 的 page id 由调用者指定

与组件级 `ui_insert`（系统自动生成 ID）不同，`pages_add` 要求调用者显式提供 `id`。

**理由：** Page id 直接作为 URL 路由段（如 `/todo-list`），具有语义意义，不适合自动生成。系统需校验 id 格式合法（`/^[a-z0-9-]+$/`）且不与现有 page 重复。

### Decision 5: `pages_reorder` 通过 move 语义实现

`pages_reorder` 接受 `page_id` 和 `index` 参数，将指定页面移动到 `pages[]` 数组的目标位置。

**备选方案：**
- 接受完整的 `page_ids[]` 数组重新排列——一次调用可以做任意排序，但风险更大（丢页面）
- `move_up` / `move_down`——过于细碎，多次调用低效

**选择理由：** 单个 page 的 move 语义最安全，既能满足任意排序需求（多次调用），又不会因为传错数组丢失页面。

### Decision 6: `create_app` 模板新增空白 `ui/pages.json`

在 `manager.ts` 的 `templateFiles` 数组中添加 `{ path: 'ui/pages.json', content: '{"pages": []}' }`。

**理由：** 最小化变更。空白模板保证文件存在且格式合法，Agent 后续通过 `pages_add` 工具添加页面。不预置默认首页，因为不同 APP 的首页结构差异很大。

### Decision 7: Agent 指引中明确禁止手动编辑 `pages.json`

更新 `AGENT.md` 和 `add-page/SKILL.md`：
- 移除所有"手动编辑 pages.json"的指导
- 添加明确规则：UI 操作必须通过 `pages_*` 和 `ui_*` MCP 工具
- 更新工具调用示例

## Risks / Trade-offs

- **Breaking change 影响现有 Agent session** → Agent session 是短生命周期的，重启后自动使用新工具名。无需迁移。
- **`pages_add` 的 id 格式校验可能过严** → 初始使用 `/^[a-z0-9][a-z0-9-]*$/`（小写字母数字和连字符），与 APP slug 校验风格一致。如有需要后续可放宽。
- **`pages_reorder` 单次 move 效率低于批量排序** → 实际场景中 APP 页面数量有限（通常 < 20），单次 move 足够。如果后续需要批量排序可以再添加。
