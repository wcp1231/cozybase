## Why

当前 Admin UI 已能展示 APP 页面，但顶层结构不是三栏工作台形态，难以同时承载全局导航、主内容和辅助对话区域。需要先在不引入新配置系统的前提下，把 Admin Layout 收敛为稳定的“左侧 sidebar、中心 content slot、右侧 chat window”结构，快速提升可用性。

## What Changes

- 保留 Admin 顶层 Layout 为硬编码实现，不引入独立的布局配置源或配置 API。
- 将 Admin 重构为固定三栏壳层：左侧 sidebar、中心 content slot、右侧 chat window。
- 让 content slot 承载 APP 页面渲染，保持现有 APP 数据来源与路由语义（`/apps/:appName/:pageId`）。
- 补齐空状态与错误态（无 UI、页面不存在）在 content slot 内的展示，不影响壳层稳定性。

## Capabilities

### New Capabilities
- （无）

### Modified Capabilities
- `admin-shell`: 将 Admin 壳层改为固定三栏布局（sidebar/content slot/chat），并明确 content slot 的页面装配行为。

## Impact

- Affected code:
  - `packages/admin`（壳层布局、路由容器、slot 渲染状态）
- API impact:
  - 无新增 API，继续使用现有 `/api/v1/apps` 与 `/stable/apps/:name/ui`
- Data/config impact:
  - 无新增配置文件与配置存储
- Risk:
  - 三栏布局在小屏场景下可能出现可用性问题，需要明确响应式收敛策略
