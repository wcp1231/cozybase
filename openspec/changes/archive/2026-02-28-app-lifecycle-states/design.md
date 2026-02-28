## Context

当前 Daemon 的 APP 状态用单维枚举 `AppState = 'draft_only' | 'stable' | 'stable_draft' | 'deleted'` 表示，由 `current_version` 和 `published_version` 两个版本号推导而来。该模型将 Stable 生命周期、Draft 存在性、软删除三个正交概念揉在一起，无法表达 Stable 版本的 running/stopped 状态，也缺少 delete/rename 的状态守卫。

核心代码路径：
- 状态定义与推导：`packages/daemon/src/core/workspace.ts`
- CRUD 操作：`packages/daemon/src/modules/apps/manager.ts`
- 发布流程：`packages/daemon/src/core/publisher.ts`
- 启动加载：`packages/daemon/src/server.ts`
- Admin 列表页：`packages/admin/src/pages/app-list.tsx`

## Goals / Non-Goals

**Goals:**
- 将 APP 状态从单维枚举重构为双维模型（Stable 状态 + Draft 存在性）
- 为 Stable 版本提供 running/stopped 运行时状态管理
- 对 delete 和 rename 操作添加基于状态的守卫
- 修正 publish 后的 Stable 运行时行为
- Admin UI 支持分别查看同一 APP 的 Stable 和 Draft 版本

**Non-Goals:**
- `discard_draft` 功能（需要文件版本控制，后续再做）
- 数据库 schema 迁移（MVP 阶段直接改 schema，不做在线迁移）
- 向老版本 `AppState` 枚举的兼容

## Decisions

### Decision 1: 双维状态模型替代扁平枚举

**当前模型：**
```typescript
type AppState = 'draft_only' | 'stable' | 'stable_draft' | 'deleted';
```

**新模型：**
```typescript
interface AppStateInfo {
  stableStatus: 'running' | 'stopped' | null;  // null = 从未发布
  hasDraft: boolean;
}
```

**Rationale:** Stable 和 Draft 是两个独立的生命周期维度。Stable 有自己的 running/stopped 状态，Draft 在存在期间始终 running。把它们拆开后，每个维度的逻辑独立且清晰，不再有状态组合爆炸的问题。

**推导逻辑：**
```
stableStatus:
  published_version === 0  → null（从未发布）
  published_version > 0    → 从 DB 字段 stable_status 读取（'running' | 'stopped'）

hasDraft:
  current_version > published_version → true
  否则                                → false
```

**替代方案：** 保留枚举但扩展为 `running | stopped | draft_only | ...`。放弃，因为状态组合会越来越多（如 `stopped_draft`），且语义不清晰。

### Decision 2: DB schema 变更

**变更内容：**

`apps` 表新增 `stable_status` 字段，废弃 `status` 字段：

```sql
-- 新增字段
ALTER TABLE apps ADD COLUMN stable_status TEXT DEFAULT NULL;
-- CHECK(stable_status IN ('running', 'stopped') OR stable_status IS NULL)

-- 旧字段 status（'active'/'deleted'）不再使用
-- SQLite 不支持 DROP COLUMN，保留但忽略
```

**`stable_status` 语义：**

| 值 | 含义 |
|---|------|
| `NULL` | 从未发布（Draft-only） |
| `'running'` | Stable 版本正在运行 |
| `'stopped'` | Stable 版本已停止 |

**Rationale:** `stable_status` 是持久化状态而非推导状态——Daemon 重启后需要知道哪些 Stable 版本应该自动启动、哪些应该保持 stopped。而 `hasDraft` 仍然从版本号推导，不需要额外字段。

### Decision 3: Stable 的 start/stop 运行时管理

在 `AppManager` 中新增两个方法：

```typescript
startStable(name: string): void
  守卫: stableStatus 必须存在且为 'stopped'
  行为: UPDATE stable_status = 'running', 启动 stable runtime

stopStable(name: string): void
  守卫: stableStatus 必须存在且为 'running'
  行为: UPDATE stable_status = 'stopped', 停止 stable runtime
```

两个操作均为幂等（重复 start running 的 APP 或 stop stopped 的 APP 不报错）。

stop Stable **不影响** Draft runtime——两个维度独立管理。

### Decision 4: delete / rename 状态守卫

**Delete 守卫规则：**
```
stableStatus === null     → 允许（Draft-only APP，直接物理删除）
stableStatus === 'stopped' → 允许（Stable 已停止，物理删除）
stableStatus === 'running' → 拒绝（BadRequestError）
```

**Rename 守卫规则：** 与 delete 相同。

**Rename 实现：** 由于 `name` 是 `apps` 表 PRIMARY KEY，SQLite 不支持直接改 PK，需要在事务中：
1. INSERT 新 name 的 app 记录（复制所有字段）
2. UPDATE `app_files` 的 `app_name` 为新 name
3. UPDATE `api_keys` 的 `app_name` 为新 name
4. DELETE 旧 name 的 app 记录
5. 重命名文件系统目录 `stable/{old}` → `stable/{new}`，`draft/{old}` → `draft/{new}`
6. 更新 workspace 缓存

**替代方案：** 使用独立的 `id` 作为 PK，`name` 作为可变字段。放弃，因为改动太大且当前所有引用都是基于 name，MVP 阶段用事务操作即可。

### Decision 5: publish 行为修正

```
首次发布（stableStatus === null）:
  → SET stable_status = 'running', published_version = current_version
  → 启动 stable runtime，清理 draft runtime

再次发布（stableStatus === 'running'）:
  → 保持 stable_status = 'running', SET published_version = current_version
  → 重启 stable runtime，清理 draft runtime

再次发布（stableStatus === 'stopped'）:
  → 保持 stable_status = 'stopped', SET published_version = current_version
  → 不启动 stable runtime（仅更新文件），清理 draft runtime
```

**关键点：** 再次发布时保留已有 `stable_status`，不无条件 restart。Stopped 的 APP 发布后用户需要手动 start。

### Decision 6: Daemon 启动逻辑适配

当前启动逻辑基于旧 `AppState` 枚举决定启动哪些 runtime。改为：

```typescript
// 旧逻辑
if (state === 'stable' || state === 'stable_draft') registry.start(name, 'stable');
if (state === 'draft_only' || state === 'stable_draft') registry.start(name, 'draft');

// 新逻辑
if (stateInfo.stableStatus === 'running') registry.start(name, 'stable');
if (stateInfo.hasDraft) registry.start(name, 'draft');
```

Stopped 的 Stable 版本在 Daemon 启动时不加载 runtime，符合 "stopped 就是停了" 的语义。

### Decision 7: Admin UI 适配

**API 响应变更：**

`GET /api/v1/apps` 返回字段调整：

```
旧: { name, state: 'draft_only' | 'stable' | 'stable_draft', has_ui, ... }
新: { name, stableStatus: 'running' | 'stopped' | null, hasDraft: boolean, has_ui, ... }
```

**Tab 过滤逻辑：**
```typescript
// 旧
stable tab → state === 'stable' || state === 'stable_draft'
draft tab  → state === 'draft_only' || state === 'stable_draft'

// 新
stable tab → stableStatus !== null
draft tab  → hasDraft === true
```

**导航区分 stable/draft 模式：**

从 Stable tab 点击 APP 导航到 `/apps/{name}?mode=stable`，从 Draft tab 点击导航到 `/apps/{name}?mode=draft`。`AppPageView` 根据 `mode` query param 决定加载 `/stable/apps/{name}/ui` 还是 `/draft/apps/{name}/ui`。

**Badge 显示：**
```
Stable Tab:
  ● running   → 绿色 badge
  ○ stopped   → 灰色 badge

Draft Tab:
  draft       → 橙色 badge（有 stable 版本的 APP）
  draft (new) → 灰色 badge（从未发布的 APP）
```

### Decision 8: MCP 工具新增

新增两个 MCP 工具供 AI Agent 使用：

```
start_app(name: string)
  → 启动 Stable 版本（守卫：必须有 stable 版本且为 stopped）

stop_app(name: string)
  → 停止 Stable 版本（守卫：必须有 stable 版本且为 running）
```

更新 `delete_app` 工具描述，说明只能删除 stopped 或未发布的 APP。

暂不为 AI Agent 提供 `rename_app` MCP 工具——rename 是低频管理操作，通过 Admin UI 或 REST API 即可。

## Risks / Trade-offs

**[状态模型变更影响面广]** → 所有读取 `AppState` 的代码都需要适配新的 `AppStateInfo` 结构。使用 TypeScript 编译器检查所有引用点，确保不遗漏。

**[rename 的事务安全]** → SQLite 中改 PRIMARY KEY 需要多步操作，任一步失败需完整回滚。通过 `BEGIN/COMMIT/ROLLBACK` 事务保证原子性。文件系统 rename 在事务提交后执行，如果文件系统 rename 失败需考虑回滚 DB 变更。

**[publish stopped APP 的用户体验]** → Stopped 的 APP publish 后仍然 stopped，用户可能困惑 "为什么发布了但看不到效果"。后续可在 Admin UI 的 publish 结果中提示 "APP 当前已停止，需要手动启动"。

**[旧 `status` 字段残留]** → SQLite 不支持 DROP COLUMN，旧的 `status` 字段会留在表中。代码中不再引用即可，不构成功能风险，仅影响整洁度。
