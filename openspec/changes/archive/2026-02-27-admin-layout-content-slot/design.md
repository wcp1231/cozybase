## Context

当前 Admin 负责平台管理入口，但顶层布局（导航、内容区、辅助区）未形成稳定的三栏工作台形态。  
本次目标是先在不引入新配置系统的前提下，把 Admin 固化为“左侧 sidebar、中心 content slot、右侧 chat window”。

这能在保持现有路由与数据链路的同时，快速提升管理端信息密度与操作效率，并为后续能力扩展预留稳定壳层结构。

## Goals / Non-Goals

**Goals:**
- 保持 Admin 顶层 Layout 为硬编码实现，并改为固定三栏结构。
- 中心 content slot 承载 APP 页面渲染，保持现有 `/apps/:appName/:pageId` 语义。
- 右侧提供 chat window 区域（首期可为占位实现），不影响既有管理功能。
- 明确无 UI、页面不存在等异常状态在 content slot 内的展示方式。

**Non-Goals:**
- 不引入 `admin/layout.json` 或任何布局配置源。
- 不新增 Admin Layout 读写 API（如 `/api/v1/admin/layout`）。
- 不改造 `@cozybase/ui` 的 schema 协议与 action 规则。
- 不重构 runtime/daemon 的现有 APP 生命周期机制。

## Decisions

### Decision 1: 采用“固定三栏 System Shell + Content Slot”

- 选择：Admin 继续作为系统壳层，使用硬编码三栏布局；中间区域作为 content slot 渲染 APP 页面。
- 原因：
  - 交付路径最短，能快速落地目标体验；
  - 无需引入新配置机制，降低联动复杂度；
  - 与当前 `packages/admin` 实现方式兼容，风险可控。
- 备选方案：
  - 方案 A（未采纳）：Admin 完全作为 APP。缺点是系统自举与权限边界复杂。
  - 方案 B（未采纳）：引入独立布局配置源。缺点是当前阶段超出必要复杂度。

### Decision 2: 复用现有接口，不新增平台 API

- 选择：继续使用 `/api/v1/apps` 与 `/stable/apps/:appName/ui` 作为数据来源。
- 原因：
  - 改动集中在 `packages/admin`，实现边界清晰；
  - 避免引入新的 API 契约与测试负担。

## Risks / Trade-offs

- [风险] 三栏布局在窄屏下可能拥挤  
  → Mitigation: 定义响应式行为（sidebar/chat 折叠或收起）。

- [风险] content slot 切换页面时闪烁  
  → Mitigation: 增加稳定 loading 占位，避免壳层重建。

- [风险] 右侧 chat window 首期能力较弱  
  → Mitigation: 明确为占位/预留区，后续迭代接入真实能力。

## Migration Plan

1. 在 `packages/admin` 将现有页面容器重构为固定三栏壳层。  
2. 将 APP 页面渲染收敛到中心 content slot。  
3. 增加 slot 内的加载态、无 UI 与页面不存在状态。  
4. 完成样式回归与基础端到端验证。

回滚策略：
- 回退 `packages/admin` 布局改动，恢复旧版容器结构。

## Open Questions

- chat window 首期是纯占位，还是要接入基础交互能力？
- sidebar 在小屏下采用抽屉还是顶部切换更合适？
- 是否需要在 slot 中支持 stable/draft 视图切换？
