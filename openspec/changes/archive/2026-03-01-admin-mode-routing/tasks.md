## 1. 后端 API 支持 mode 过滤

- [x] 1.1 `AppManager.listApps()` 方法增加可选 `mode` 参数，支持按 `stable` / `draft` 过滤返回结果
- [x] 1.2 `GET /api/v1/apps` REST 接口解析 `?mode=` query param 并传给 `listApps()`
- [x] 1.3 更新 `apps-api.test.ts` 测试，验证 `?mode=stable` 和 `?mode=draft` 过滤行为

## 2. 路由结构重构

- [x] 2.1 `app.tsx` 路由结构改为 `/:mode/apps` 嵌套，`/` redirect 到 `/stable/apps`
- [x] 2.2 `AppLayout` 从 `useParams()` 读取 `mode`，校验合法值（非法值 redirect 到 `/stable/apps`）
- [x] 2.3 `AppLayout` 移除 `useSearchParams` 对 mode 的读取逻辑

## 3. App 列表页改造

- [x] 3.1 `AppListPage` 的 Tab 从 `<button>` + `useState` 改为 `<Link to="/{mode}/apps">`
- [x] 3.2 移除 Tab 上的 count badge
- [x] 3.3 Active tab 状态从 URL `:mode` 参数推导
- [x] 3.4 App 卡片链接改为 `/${mode}/apps/${appName}` 格式
- [x] 3.5 App 列表 API 调用加上 `?mode=` 参数

## 4. Sidebar 与内部导航修复

- [x] 4.1 Sidebar "APP 列表" NavLink 改为 `/${mode}/apps`
- [x] 4.2 Sidebar CozyBase Logo 链接改为 `/${mode}/apps`
- [x] 4.3 Sidebar Page 导航 NavLink 改为 `/${mode}/apps/${appName}/${pageId}`

## 5. AppPageView 与 content-slot 适配

- [x] 5.1 `AppPageView` 从 `useParams()` 读取 `mode`，移除 `useSearchParams` 的 mode 读取
- [x] 5.2 `content-slot.ts` 的 `toAppPagePath()` 改为生成 `/${mode}/apps/${appName}/${pageId}` 格式
- [x] 5.3 更新 `content-slot.e2e.test.ts` 测试，验证新路径格式

## 6. 验证

- [ ] 6.1 手动验证：从 stable tab 进入 app，sidebar 页面切换保持 stable mode
- [ ] 6.2 手动验证：从 draft tab 进入 app，sidebar 页面切换保持 draft mode
- [ ] 6.3 手动验证：浏览器前进/后退在 stable/draft 间正确切换
- [ ] 6.4 手动验证：直接访问 `/` 正确 redirect 到 `/stable/apps`
