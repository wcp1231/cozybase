## Why

当前 APP 页面使用扁平 `id` 作为路由标识（如 `orders`），所有页面平级排列在 `pages[]` 数组中，无法表达父子层级关系。这导致子页面（如详情页、编辑页）和顶层页面一起显示在 Tab 栏中，面包屑只能展示两级（APP 名 / 当前页面），不支持参数化路由（如 `/orders/1024`）。AI Agent 在构建多层级 APP 时缺乏结构化的页面层级表达能力。

## What Changes

- **BREAKING** `PageSchema.id` 字段重命名为 `PageSchema.path`，值从扁平标识符（如 `orders`）扩展为 URL 路径模式（如 `orders/:orderId/refund`），路径即层级、路径段中的 `:param` 即页面参数声明
- **BREAKING** MCP 工具参数全局从 `id` / `page_id` 重命名为 `path` / `page_path`，工具描述更新为说明路径模式语法
- 新增前端路由匹配逻辑——使用 `react-router-dom` 的 `matchPath` 将 URL 路径匹配到页面路径模式，提取路径参数
- Tab 栏仅展示顶层页面（路径不含 `/` 的页面），子页面从 Tab 栏中移除
- 面包屑升级为多级——根据 URL 路径逐段匹配页面，构建完整的层级链，中间节点可点击跳回
- 页面标题支持 `${params.xxx}` 表达式，在面包屑中动态渲染

## Capabilities

### New Capabilities

- `page-url-routing`: 基于 URL 路径模式的页面路由匹配、路径参数提取、多级面包屑构建、顶层页面过滤

### Modified Capabilities

- `page-level-editing`: 页面 MCP 工具参数从 `id` / `page_id` 改为 `path` / `page_path`，页面路径格式从扁平标识符扩展为支持 `/` 分隔符和 `:param` 段的 URL 路径模式
- `page-schema-validation`: 页面路径验证规则从 `PAGE_ID_PATTERN`（仅允许小写字母、数字、连字符）扩展为支持多段路径和参数段的 `PAGE_PATH_PATTERN`

## Impact

- **Schema 层** (`@cozybase/ui`): `pageSchema` 的 `id` → `path`，`validate.ts` 中错误信息路径引用更新
- **前端** (`@cozybase/web`): `content-slot.ts` 路由解析重写，`app-page-view.tsx` Tab 栏过滤和参数合并，`app-section-header.tsx` 多级面包屑渲染
- **后端** (`@cozybase/daemon`): `page-editor.ts` 全局 id→path 重命名和路径验证逻辑，MCP 工具定义和 handler 参数映射更新
- **测试**: `content-slot.test.ts`、`page-editor.test.ts` 及 MCP 相关测试的 fixture 和断言全量更新
- **现有 `pages.json` 数据**: 所有已有 APP 的 `pages.json` 需要将 `id` 字段重命名为 `path`（值不变，单段路径向后兼容）
