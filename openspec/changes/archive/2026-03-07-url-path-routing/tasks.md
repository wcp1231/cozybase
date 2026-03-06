## 1. Schema 与校验迁移

- [x] 1.1 将 `packages/ui/src/schema` 中现有的页面标识全面从 `id` 迁移为 `path`，保持 `PagesJson.pages` 继续使用 `PageSchema[]` 作为 canonical schema
- [x] 1.2 更新 `normalizePagesJson`、`validatePagesJson` 与相关错误路径，校验页面 `path` 为合法 URL 路径模式且 `title`/`body` 结构仍可被规范化
- [x] 1.3 调整 `packages/ui/src/schema/types.ts`、`zod.ts` 及消费这些类型的代码，使页面访问统一通过 `page.path`

## 2. 前端路由解析与导航

- [x] 2.1 重构 `packages/web/src/pages/content-slot.ts`，基于标准路径匹配库从 `pages[]` 中按数组顺序解析当前 URL、提取路径参数，并在无子路径时重定向到首个顶层页面
- [x] 2.2 更新页面渲染链路，将路径参数与 query 参数合并传入 `SchemaRenderer`，并确保同名字段以路径参数为准
- [x] 2.3 调整 Tab 栏与页面切换逻辑，只展示顶层路径 key（不含 `/`）对应的页面，并在路径跳转时继续复用现有相对 URL 解析机制
- [x] 2.4 重构面包屑构建逻辑，按当前 URL 的逐段前缀匹配页面定义，支持 `${params.xxx}` 标题插值与缺失中间页面时的自动跳过
- [x] 2.5 为页面内导航增加“直接静态子页面” Tab 逻辑，仅展示当前上下文下无需参数的直接子页面，并在数量小于等于 1 时自动隐藏
- [x] 2.6 调整 Header breadcrumb 的显示条件与交互：顶层页面隐藏、二级及以上页面显示、根节点固定为 APP 名称、父级可点击且当前页不可点击

## 3. Page 编辑器与 MCP 工具迁移

- [x] 3.1 重构 `packages/daemon/src/modules/apps/page-editor.ts` 的读写与遍历逻辑，使其基于 `pages[]` 数组按 `path` 管理页面
- [x] 3.2 将页面级 MCP 参数与返回值统一从 `id` / `page_id` 改为 `path` / `page_path`，同步更新 `pages_list`、`pages_add`、`pages_remove`、`pages_update`、`pages_reorder` 与 `ui_outline`
- [x] 3.3 更新页面新增、删除、排序与标题更新的实现细节，确保数组顺序在校验失败时不会部分写入 `ui/pages.json`
- [x] 3.4 调整新建 APP 模板、fixture 与相关辅助工具，使默认 `ui/pages.json` 使用新的 `{"pages": []}` 结构

## 4. 测试与回归验证

- [x] 4.1 更新 `packages/ui` 的 schema 单元测试，覆盖数组结构、非法页面 `path`、标题表达式页面与规范化后的错误路径
- [x] 4.2 更新 `packages/web` 的页面路由测试，覆盖静态路径、参数化路径、多级路径、根路径重定向、路径参数覆盖 query 参数及多级面包屑
- [x] 4.3 更新 `packages/daemon` 的 `page-editor` 与 MCP 测试，覆盖 `page_path` 参数、数组排序、路径校验、删除页面及失败回滚
- [x] 4.4 执行受影响测试套件并修复回归，确认旧 `page.id`/`page_id` 入口不再被代码路径依赖
- [x] 4.5 更新 `packages/web` 的页面导航测试，覆盖子页面 Tab 的可见性、父级回退显示、breadcrumb 顶层隐藏及页面跳转后的动态更新
