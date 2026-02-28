## Why

当前 Daemon 中 APP 状态管理存在结构性问题：

1. **`AppState` 是单维扁平枚举**（`draft_only | stable | stable_draft | deleted`），把 Stable 是否存在、Draft 是否存在、是否被删除全部揉在一个维度里。实际上 Stable 和 Draft 是两个独立的生命周期维度，需要独立管理。

2. **Stable 版本没有 running/stopped 概念**。所有已发布的 APP 在 Daemon 启动时自动运行，无法停止。

3. **`delete` 操作没有状态守卫**，运行中的 APP 可以被直接删除。

4. **没有 `rename` 功能**。

5. **`publish` 后的运行时行为不正确**：无论 Stable 之前是什么状态，publish 后都会重启 Stable runtime。

6. **Admin UI 无法区分 Stable/Draft 版本**：APP 列表虽有 stable/draft 两个 tab，但点击进入 APP 后始终加载 stable 版本的 UI，无法分别查看 Stable 和 Draft 版本内容。

## What Changes

- 将 `AppState` 从单维枚举重构为双维状态模型（Stable 状态 + Draft 存在性）
- 为 Stable 版本引入 `running` / `stopped` 生命周期
- 为 `delete` 和新增的 `rename` 操作添加状态守卫（仅 stopped 或未发布时可执行）
- 修正 `publish` 行为：首次发布自动 running，再次发布保持已有 Stable 状态
- 移除 soft delete 机制（`status = 'deleted'`），改为物理删除
- Admin UI 适配：API 返回新状态模型，Tab 过滤用 `stableStatus`/`hasDraft` 两个字段，点击 APP 时区分 stable/draft 模式加载对应版本 UI

## Status

设计方向已确认，可以进入 design + tasks 阶段。

### 已确认的设计决策

1. Stable 和 Draft 是两个独立维度，不再用单一枚举表示
2. Stop Stable 不影响 Draft 运行
3. Publish 时保持 Stable 的已有状态（stopped 发布后仍然 stopped）
4. 首次发布（draft-only → stable）自动设为 running
5. 物理删除，不再需要 soft delete
6. MVP 阶段不引入 `discard_draft` 工具（等后续 `app_files` 版本控制时再考虑）

### 不在范围内

- `discard_draft` 功能（需要文件版本控制支持）
- 数据库 schema 迁移（MVP，直接改 schema）
- 向老版本 AppState 兼容

## Capabilities

### New Capabilities
- `app-stable-lifecycle`: Stable 版本的 start/stop 生命周期管理
- `app-rename`: APP 重命名能力（仅在 stopped 或未发布时可用）

### Modified Capabilities
- `mcp-tools`: 新增 `start_app` / `stop_app` MCP 工具，更新 `delete_app` 工具描述
- `app-management`（隐含于 daemon 代码）: AppState 模型重构，delete 守卫，publish 行为修正
- `admin-app-list`: Tab 过滤逻辑适配新状态模型，Badge 显示 running/stopped，点击 APP 时区分 stable/draft 模式

## Impact

- Affected code:
  - `packages/daemon/src/core/workspace.ts` — AppState 类型重构，DB schema 变更，状态推导逻辑
  - `packages/daemon/src/modules/apps/manager.ts` — delete 守卫，新增 startStable/stopStable/rename 方法
  - `packages/daemon/src/core/publisher.ts` — 首次发布 vs 再次发布的 stable_status 处理
  - `packages/daemon/src/server.ts` — 启动逻辑适配新状态模型，publish 后不无条件 restart
  - `packages/daemon/src/modules/apps/routes.ts` — 新增 start/stop/rename REST 接口
  - `packages/daemon/src/mcp/` — 新增 start_app/stop_app MCP 工具，更新 handlers
  - `packages/daemon/src/modules/apps/mcp-types.ts` — 新增工具的 Zod schema 定义
  - `packages/admin/src/pages/app-list.tsx` — Tab 过滤逻辑、Badge 样式、导航链接附带 mode
  - `packages/admin/src/pages/app-page-view.tsx` — 根据 mode 参数加载 stable 或 draft 版本 UI
  - `packages/admin/src/pages/app-layout.tsx` — API 响应类型适配新状态字段
- Risk:
  - 状态模型变更影响面较广，需要确保所有读取 AppState 的地方都适配新模型
  - rename 涉及 PRIMARY KEY 变更，需要事务安全的 INSERT+DELETE 操作
