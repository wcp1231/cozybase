## Context

当前 Cozybase APP 页面使用扁平 `id` 标识路由（如 `orders`），URL 结构为 `/:mode/apps/:appName/:pageId?query=params`。页面解析通过 `pages.find(p => p.id === pageId)` 精确匹配，所有页面平级显示在 Tab 栏中。面包屑只有两级（APP 名 / 当前页面标题），不支持父子层级。

这套设计在页面间有层级关系时（列表→详情→编辑）遇到了明确的局限：子页面出现在 Tab 栏中、面包屑无法表达层级、参数化页面（如 `/orders/1024`）无法通过 `id` 匹配。

当前无历史版本需要兼容。可以大胆重构。

## Goals / Non-Goals

**Goals:**
- 页面路径 (`path`) 即层级：路径自然表达父子关系（`orders/:orderId/refund` 是 `orders/:orderId` 的子级）
- 路径参数即页面参数：`:orderId` 直接从 URL 路径段中提取，不依赖 query string
- Tab 栏只显示顶层页面（路径不含 `/`），子页面从 Tab 中移除
- 页面内子页面 Tab 仅显示当前上下文下的直接静态子页面，并在数量不足时自动隐藏
- 面包屑根据 URL 层级逐段匹配，构建可点击的多级导航链，并在顶层页面时自动隐藏
- AI Agent 用标准的 URL 路径模式（与 React Router、Express 等一致）定义页面，降低理解成本

**Non-Goals:**
- 不支持嵌套渲染（父页面中嵌入 `<Outlet />` 渲染子页面）——当前为全屏切换
- 不引入独立的 navigation 配置树——路径本身即结构
- 不处理页面级权限/角色控制
- 不更改 Link action 的 `resolveUrl` 机制——现有 `baseUrl + url` 拼接天然适配路径形式

## Decisions

### 1. `PageSchema.id` → `PageSchema.path`，pages 保持数组结构

将 `PageSchema` 的 `id` 字段重命名为 `path`，值从扁平标识符（`orders`）扩展为 URL 路径模式（`orders/:orderId/refund`）。`PagesJson.pages` 继续使用数组（而非 Record），保留通过数组位置控制页面排序的能力。

**替代方案**：用 `Record<string, PageSchema>`（key 为路径）。弃选原因：Record 的 key 顺序不便排序，MCP 工具的 `pages_reorder` 难以实现。

### 2. 使用 `react-router-dom` 的 `matchPath` 做路由匹配

前端路由匹配使用 `react-router-dom`（已有依赖）提供的 `matchPath({ path, end: true }, subPath)`，逐页面模式匹配 URL。不引入额外的 `path-to-regexp` 或自定义路由匹配器。

**匹配顺序**：按 `pages[]` 数组顺序逐一匹配，首个命中即返回。这意味着更具体的静态路径应排在参数化路径前面（与 React Router 的路由注册惯例一致），由页面作者负责。

### 3. 顶层页面判定：`!path.includes('/')`

路径中不包含 `/` 的页面为顶层页面，显示在 Tab 栏中。例如 `orders` 是顶层，`orders/:orderId` 是子页面。这个判定规则简单直接，不需要额外的 `isTopLevel` 标记字段。

### 4. 面包屑通过 URL 前缀逐段匹配构建

给定 URL 子路径 `orders/1024/refund`，按 `["orders", "orders/1024", "orders/1024/refund"]` 逐段匹配页面路径模式。每段匹配成功则生成一个面包屑节点，标题通过 `${params.xxx}` 表达式动态渲染。中间缺少页面定义时该段自动跳过。

**显示策略**：只有匹配链长度大于 1 时才显示 breadcrumb。breadcrumb 根节点固定为 APP 名称；数组中只传 APP 之后的层级节点。

### 5. 子页面 Tab 使用“直接静态子页面”规则

页面内子页面 Tab 不显示所有子孙页面，而是只显示当前导航上下文下的“直接静态子页面”：
- 相对父页面路径只多出一个段
- 该新增段不能是 `:param`
- 保持 `pages[]` 中的原始顺序

当前页面自身没有可显示子页面时，系统会沿匹配链向上寻找最近一个拥有可显示子页面的父页面作为 Tab 上下文。因此在 `orders/:orderId/refund` 页面中，仍可显示 `orders/:orderId` 下的 `refund` / `logs` 子页面切换。

**显示策略**：当可见子页面数量小于等于 1 时，不显示子页面 Tab。

### 6. 路径参数与 query 参数合并，路径参数优先

`matchPath` 提取的路径参数（如 `{ orderId: "1024" }`）与 URL query string 参数合并后传入 `SchemaRenderer`。路径参数优先级高于同名 query 参数。

### 7. 路径验证采用逐段检查

后端 `page-editor.ts` 中不用单个复杂正则，而是 `split('/')` 后逐段验证：
- 静态段：`/^[a-z0-9][a-z0-9-]*$/`
- 动态段：`/^:[a-zA-Z][a-zA-Z0-9]*$/`

### 8. MCP 工具参数重命名

- `pages_add`: `id` → `path`
- `pages_remove`/`pages_update`/`pages_reorder`: `page_id` → `page_path`
- `ui_outline`: `page_id` → `page_path`
- `pages_list` 返回结果中 `id` → `path`

## Risks / Trade-offs

**路由匹配顺序依赖数组位置** → 在 MCP 工具描述和 Agent 文档中说明：静态路径应排在参数化路径前面。`pages_add` 的 `index` 参数可控制插入位置。

**所有现有 `pages.json` 的 `id` 字段需迁移** → 编写一次性迁移脚本将 `id` 重命名为 `path`（值不变），或在读取时做兼容转换。由于用户明确表示无历史兼容需求，优先选择直接迁移。

**`matchPath` 按数组顺序逐个匹配，性能随页面数线性增长** → 一个 APP 内页面数通常在 10-50 范围内，线性匹配无性能问题。

**面包屑标题中的 `${params.xxx}` 使用简单字符串替换而非完整表达式引擎** → 面包屑场景只需参数插值，不需要条件表达式或函数调用。如未来需要更复杂的表达式，可复用 `resolveExpression` 引擎。
