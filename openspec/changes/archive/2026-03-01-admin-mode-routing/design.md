## Context

当前 Admin UI 使用 query param (`?mode=draft`) 区分 stable/draft 模式。在 app 内部页面跳转时，多处导航入口未携带 mode 参数，导致回退到 stable 模式。这是一个结构性问题——query param 方案要求所有导航点都正确传递 mode，维护成本高且容易出 bug。

后端路由已经是路径区分：`/stable/apps/:name/...` 和 `/draft/apps/:name/...`。前端路由需要对齐。

## Goals / Non-Goals

**Goals:**

- 将 mode 编码在 URL 路径中，消除 mode 丢失的可能性
- 前后端路由结构对齐
- Tab 切换改为 URL 导航，支持浏览器前进/后退
- App 列表 API 支持按 mode 过滤

**Non-Goals:**

- 不改动 `@cozybase/ui` 包（SchemaRenderer、action engine 等）
- 不改动 Schema link action 的 URL 解析机制
- 不处理旧 URL 格式兼容（无历史遗留）

## Decisions

### 决策 1：mode 作为路由路径前缀

**选择**：`/:mode/apps/...` 路由结构

**备选方案**：
- A) 保持 query param，逐一修补丢失 mode 的地方 → 修补性方案，未来每个新导航入口都要记得处理
- B) React Context 持久化 mode → 刷新页面后丢失，schema link action 脱离 React 体系无法受益
- C) `/apps/:mode/...` 把 mode 放在 apps 后面 → 可行但与后端路由 `/stable/apps/...` 不对称

选择 `/:mode/apps/...` 是因为：
1. 与后端路由结构 `/stable/apps/:name/...` 完全对齐
2. mode 作为路由参数不可能在导航中丢失
3. React Router 的 `useParams()` 直接获取，无需 `useSearchParams()`

### 决策 2：Tab 改为导航链接

**选择**：Tab 从 `<button>` + `useState` 改为 `<Link to="/{mode}/apps">`

原因：
1. URL 始终反映当前视图状态
2. 浏览器前进/后退可以在 stable/draft 视图间切换
3. active tab 从 URL `:mode` 参数推导，无需本地状态
4. 去掉 tab 上的 count 数字，简化 UI

### 决策 3：后端 API 支持 mode 过滤

**选择**：`GET /api/v1/apps?mode=stable|draft` 增加可选 mode 参数

原因：
1. 前端按 mode 分页展示，不需要一次拉取全量再过滤
2. 无参数时返回全部 APP，向后兼容
3. 过滤逻辑复用已有的 `stableStatus` / `hasDraft` 推导

### 决策 4：React Router 路由结构

```tsx
<Routes>
  <Route path="/" element={<Navigate to="/stable/apps" replace />} />
  <Route path="/:mode/apps" element={<AppLayout />}>
    <Route index element={<AppListPage />} />
    <Route path=":appName" element={<AppPageView />} />
    <Route path=":appName/:pageId" element={<AppPageView />} />
  </Route>
</Routes>
```

`AppLayout` 从 `useParams()` 获取 `mode`，传递给所有子组件。所有内部链接使用 `/${mode}/apps/...` 格式。

### 决策 5：Sidebar 链接保持 mode 上下文

- "APP 列表" 链接 → `/${mode}/apps`（保持在当前 mode）
- Page 导航 → `/${mode}/apps/${appName}/${pageId}`
- CozyBase Logo → `/${mode}/apps`（保持在当前 mode）

## Risks / Trade-offs

- **React Router `:mode` 参数无约束** → 用户可以手动输入 `/invalid/apps`。缓解：在 `AppLayout` 中校验 mode 值，非法值 redirect 到 `/stable/apps`。

- **所有内部链接都要使用 mode 前缀** → 与 query param 方案不同的是，路径方案中如果遗漏 mode 前缀，链接会直接 404 而不是"静默回退到 stable"，问题更容易被发现和修复。
