## 1. 项目脚手架

- [x] 1.1 初始化 `packages/ui` 包：创建 `package.json`（name: `@cozybase/ui`），配置 TypeScript、React 依赖，ESM 输出
- [x] 1.2 初始化 `packages/admin` 包：创建 `package.json`（name: `@cozybase/admin`），配置 Vite + React，添加 `@cozybase/ui` workspace 依赖
- [x] 1.3 配置 monorepo 构建顺序：确保 `packages/ui` → `packages/admin` 的依赖关系正确
- [x] 1.4 配置 admin dev server 的 API 代理，将 `/api/*`、`/stable/*`、`/draft/*` 转发到 server

## 2. UI Schema 类型定义

- [x] 2.1 定义 `PageSchema` 类型（id、title、body）
- [x] 2.2 定义 `ComponentSchema` 基础类型（type、id、visible、className、style）及各组件的扩展类型
- [x] 2.3 定义 `ActionSchema` 类型（api、reload、dialog、link、close、confirm 六种 action）
- [x] 2.4 定义 `ExpressionContext` 类型（components、row、form、params、response、props 作用域）
- [x] 2.5 定义 `CustomComponentSchema` 类型（props 定义 + body 模板）
- [x] 2.6 定义 `PagesJson` 顶层类型（pages + components），确保类型导出供 admin 包和 server 包使用

## 3. 渲染引擎核心

- [x] 3.1 实现 `ExpressionResolver`：解析 `${...}` 表达式，支持属性访问、比较、三元运算，使用白名单解析（非 eval）
- [x] 3.2 实现 `PageContext`（React Context）：组件状态注册/注销、跨组件引用、reload 信号机制、dialog 栈管理、baseUrl 存储
- [x] 3.3 实现 `ActionDispatcher`：处理 6 种 action 类型，支持 action 数组顺序执行，支持 onSuccess/onError 回调链，URL 自动补全
- [x] 3.4 实现 `ComponentRegistry`：内置组件注册、自定义组件查找、未知组件错误占位符
- [x] 3.5 实现 `SchemaRenderer` 入口组件：递归渲染组件树，注入 PageContext，处理渲染错误边界

## 4. 内置组件 — 布局类

- [x] 4.1 实现 `page` 组件：全宽容器，垂直排列子组件
- [x] 4.2 实现 `row` 组件：水平排列，支持 justify、align、gap、wrap
- [x] 4.3 实现 `col` 组件：垂直排列，支持 align、gap
- [x] 4.4 实现 `card` 组件：带标题/边框/阴影的卡片容器
- [x] 4.5 实现 `tabs` 组件：标签切换器，支持有 body/无 body 两种模式，状态注册到 PageContext
- [x] 4.6 实现 `divider` 组件：水平分隔线，支持可选 label

## 5. 内置组件 — 数据展示类

- [x] 5.1 实现 `table` 组件：API 数据加载、列渲染、自定义列 render、行操作按钮、分页、expression 参数联动自动刷新
- [x] 5.2 实现 `list` 组件：API 数据加载、itemRender 模板渲染
- [x] 5.3 实现 `text` 组件：文本渲染，支持 expression
- [x] 5.4 实现 `heading` 组件：标题渲染，支持 level 1-6
- [x] 5.5 实现 `tag` 组件：状态标签，支持 5 种颜色
- [x] 5.6 实现 `stat` 组件：统计指标卡，支持 label、value、prefix、suffix

## 6. 内置组件 — 数据输入类

- [x] 6.1 实现 `form` 组件：表单状态管理、字段验证、API 提交、onSuccess/onError 回调、initialValues 支持
- [x] 6.2 实现 `input` 组件：单行文本输入，独立使用和 form 内自动集成
- [x] 6.3 实现 `textarea` 组件：多行文本输入，支持 rows 配置
- [x] 6.4 实现 `number` 组件：数字输入，支持 min/max/step
- [x] 6.5 实现 `select` 组件：下拉选择，支持单选/多选
- [x] 6.6 实现 `switch` 组件：开关切换，支持 onChange action
- [x] 6.7 实现 `checkbox` 组件：复选框，支持单选和 options 多选模式
- [x] 6.8 实现 `radio` 组件：单选框组
- [x] 6.9 实现 `date-picker` 组件：日期选择器，支持 format 配置

## 7. 内置组件 — 操作和反馈类

- [x] 7.1 实现 `button` 组件：支持 variant、disabled/loading expression、action 执行
- [x] 7.2 实现 `link` 组件：导航链接
- [x] 7.3 实现 `dialog` 组件：模态弹窗，配合 PageContext dialog 栈使用
- [x] 7.4 实现 `alert` 组件：提示信息条，支持 4 种类型
- [x] 7.5 实现 `empty` 组件：空状态占位

## 8. Admin SPA 壳子

- [x] 8.1 实现 Admin 路由配置：`/`、`/apps`、`/apps/:appName`、`/apps/:appName/:pageId`
- [x] 8.2 实现 App 列表页：调用 `GET /api/v1/apps` 获取数据，展示 App 名称、描述、状态、是否有 UI
- [x] 8.3 实现 App 视图加载逻辑：获取 App 信息 → 解析 `ui/pages.json` → 找到 pageId 对应页面 → 构造 baseUrl → 渲染 SchemaRenderer
- [x] 8.4 实现导航布局：侧边栏显示 App 页面列表、顶部栏显示 App 名称和页面标题
- [x] 8.5 实现错误处理：App 无 UI、页面不存在、JSON 解析失败等异常场景的展示

## 9. Server 静态文件集成

- [x] 9.1 在 `packages/server` 的 Hono 应用中添加静态文件中间件，serve admin build 产物
- [x] 9.2 配置 SPA fallback：非 API 路由、非静态文件的请求返回 `index.html`
- [x] 9.3 确保 API 路由（`/api/*`、`/stable/*`、`/draft/*`）优先于静态文件匹配

## 10. MCP 工具描述更新

- [x] 10.1 更新 `update_app_file` 工具描述，补充 `ui/pages.json` 文件格式说明和可用组件/action 类型列表
- [x] 10.2 更新 Checkout-Edit-Push 工作流描述，说明仅修改 UI 文件时不需要 reconcile/verify/publish

## 11. Welcome App UI 示例

- [x] 11.1 为 Welcome TODO App 创建 `ui/pages.json`，包含：todo 列表页（table + 筛选 tabs + 新建按钮 + 删除行操作）
- [x] 11.2 验证 Welcome App 的 UI 在 Admin 中完整可用：数据加载、新建、切换完成状态、删除、筛选均正常工作

## 12. 测试

- [x] 12.1 为 `ExpressionResolver` 编写单元测试：属性访问、字符串模板、比较、三元、路径不存在等场景
- [x] 12.2 为 `ActionDispatcher` 编写单元测试：api action URL 补全、onSuccess/onError 链、action 数组顺序执行
- [x] 12.3 为 `ComponentRegistry` 编写单元测试：内置组件查找、自定义组件查找、未知组件 fallback
- [x] 12.4 为 `SchemaRenderer` 编写集成测试：JSON schema 输入 → React 组件树输出
- [x] 12.5 为 Admin App 视图加载编写集成测试：pages.json 解析、页面路由匹配、baseUrl 构造
