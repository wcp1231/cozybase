## Why

Admin UI 的 stable/draft 模式区分逻辑存在结构性缺陷：

1. **mode 通过 query param (`?mode=draft`) 传递**，但在 app 内部页面跳转时 query param 会丢失，导致页面回退到 stable 模式，数据错误或页面找不到。

2. **丢失 mode 的场景至少有两处**：
   - Sidebar 页面导航的 `NavLink` 没有携带 `?mode=` 参数（`app-layout.tsx:362`）
   - Schema 渲染器的 link action 使用 `window.location.href` 直接跳转，完全脱离 React Router，query param 自然丢失（`action.ts:123`）

3. **根本原因**：query param 方案要求每一个导航入口都"记得"带上 mode，这是一个"需要全局一致才能正确"的脆弱设计。任何新增的导航点遗漏都会产生 bug。

## What Changes

将 mode 从 query param 提升为 URL 路径的一部分，与后端路由结构对齐：

```
当前：  /apps/:appName/:pageId?mode=draft
改为：  /:mode/apps/:appName/:pageId

其中 :mode = "stable" | "draft"
```

对应后端已有的路由结构：
```
/stable/apps/:name/ui
/stable/apps/:name/fn/*
/draft/apps/:name/ui
/draft/apps/:name/fn/*
```

具体改动：

- **路由结构重构**：`/:mode/apps` 作为顶层路由，mode 成为路由参数
- **Tab 交互改为导航**：Stable/Draft tab 从 `useState` 切换改为 `<Link>` 导航到 `/{mode}/apps`，去掉 tab 上的 count 数字
- **App 列表 API 支持 mode 过滤**：`GET /api/v1/apps?mode=stable|draft`，按需返回对应模式的 app 列表
- **Sidebar 链接自动携带 mode**：所有内部链接使用 `/${mode}/apps/...` 格式，mode 不可能丢失
- **默认路由**：`/` redirect 到 `/stable/apps`

## Status

设计方向已确认，可以进入 design + tasks 阶段。

### 已确认的设计决策

1. mode 编码在 URL 路径中（`/:mode/apps/...`），不再使用 query param
2. 前端路由结构与后端路由结构对齐（`/stable/apps/...` 和 `/draft/apps/...`）
3. Tab 切换改为 URL 导航，active 状态从 URL 推导
4. App 列表 Tab 不显示 count 数字，简化 UI
5. 后端 app 列表 API 支持 `?mode=` 过滤参数
6. 不需要兼容旧的 `?mode=` query param URL 格式

### 不在范围内

- `@cozybase/ui` 包的改动（SchemaRenderer、action engine 等不需要变更）
- Schema link action 的 URL 解析机制改动（当前没有用于页面间导航的 link action）

## Capabilities

### Modified Capabilities

- `admin-app-list`: 路由结构重构为 `/:mode/apps`，Tab 交互改为导航，去掉 count
- `app-management`: app 列表 API 支持 `?mode=stable|draft` 过滤参数

## Impact

- Affected code:
  - `packages/admin/src/app.tsx` — 路由结构改为 `/:mode/apps` 嵌套
  - `packages/admin/src/pages/app-layout.tsx` — `selectedMode` 从 `useParams()` 读取；sidebar 链接改为 `/${mode}/apps/...`
  - `packages/admin/src/pages/app-list.tsx` — Tab 改为 `<Link>`；去掉 count；mode 从 route param 读取
  - `packages/admin/src/pages/app-page-view.tsx` — mode 从 `useParams()` 读取
  - `packages/admin/src/pages/content-slot.ts` — `toAppPagePath()` 生成 `/${mode}/apps/${appName}/${pageId}` 格式
  - `packages/daemon/src/modules/apps/routes.ts` — app 列表接口支持 `?mode=` 过滤
  - `packages/daemon/src/modules/apps/manager.ts` — `listApps()` 支持 mode 过滤参数
- Risk:
  - 改动范围集中在 admin 前端 + 后端 API 一处小改动，风险可控
  - 需要确保测试覆盖 `content-slot.ts` 的路径生成逻辑
