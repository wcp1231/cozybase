# Page URL Routing

## Purpose

定义 APP 页面如何使用 URL 路径模式进行匹配、参数提取、层级导航、子页面导航与相对链接解析。

## Requirements

### Requirement: 系统根据 URL 路径模式匹配页面

系统 SHALL 使用 URL 路径模式匹配将浏览器 URL 子路径解析到 `pages[]` 中的页面。匹配规则 SHALL 使用 `react-router-dom` 的 `matchPath` 函数，按 `pages[]` 数组顺序逐一尝试精确匹配（`end: true`）。首个匹配成功的页面即为目标页面。

#### Scenario: 静态路径匹配

- **WHEN** 用户访问 URL 子路径 `orders`
- **AND** `pages[]` 中存在 `path: "orders"` 的页面
- **THEN** 系统 SHALL 匹配到该页面并渲染其 `body`

#### Scenario: 参数化路径匹配并提取路径参数

- **WHEN** 用户访问 URL 子路径 `orders/1024`
- **AND** `pages[]` 中存在 `path: "orders/:orderId"` 的页面
- **THEN** 系统 SHALL 匹配到该页面
- **AND** 系统 SHALL 提取路径参数 `{ orderId: "1024" }`

#### Scenario: 多层路径匹配

- **WHEN** 用户访问 URL 子路径 `orders/1024/refund`
- **AND** `pages[]` 中存在 `path: "orders/:orderId/refund"` 的页面
- **THEN** 系统 SHALL 匹配到该页面
- **AND** 系统 SHALL 提取路径参数 `{ orderId: "1024" }`

#### Scenario: 无匹配页面时显示 not-found

- **WHEN** 用户访问的 URL 子路径在 `pages[]` 中无匹配项
- **THEN** 系统 SHALL 返回页面不存在状态

### Requirement: 路由优先级由页面数组顺序决定

当多个页面路径模式都可能匹配同一个 URL 子路径时，系统 SHALL 以 `pages[]` 中更靠前的页面为准。系统 MUST NOT 对路径模式额外引入隐式排序规则。

#### Scenario: 静态路径优先于后置的参数化路径

- **WHEN** `pages[]` 依次包含 `path: "orders/new"` 与 `path: "orders/:orderId"`
- **AND** 用户访问 URL 子路径 `orders/new`
- **THEN** 系统 SHALL 匹配到 `orders/new`
- **AND** 系统 MUST NOT 将 `new` 解析为 `orderId`

#### Scenario: 参数化路径在前时优先命中

- **WHEN** `pages[]` 依次包含 `path: "orders/:orderId"` 与 `path: "orders/new"`
- **AND** 用户访问 URL 子路径 `orders/new`
- **THEN** 系统 SHALL 先命中数组中更靠前的 `orders/:orderId`
- **AND** 系统行为 SHALL 与页面定义顺序保持一致

### Requirement: 路径参数与 query 参数合并传入页面渲染

系统 SHALL 将路径匹配提取的参数与 URL query string 参数合并后传入页面渲染上下文。路径参数 MUST 优先于同名 query 参数。

#### Scenario: 路径参数在表达式中可用

- **WHEN** 页面中某组件使用表达式 `${params.orderId}`
- **AND** 当前 URL 子路径为 `orders/1024`
- **THEN** 表达式 SHALL 解析为 `"1024"`

#### Scenario: 路径参数覆盖同名 query 参数

- **WHEN** URL 子路径为 `orders/1024`
- **AND** URL query string 包含 `?orderId=999`
- **THEN** `params.orderId` SHALL 为 `"1024"`

### Requirement: 顶层 Tab 仅显示顶层页面

系统 SHALL 将路径不包含 `/` 分隔符的页面识别为顶层页面。顶层 Tab 栏 MUST 只渲染顶层页面，子页面（路径包含 `/`）MUST NOT 出现在顶层 Tab 栏中。

#### Scenario: 顶层页面显示在 Tab 栏

- **WHEN** APP 的 `pages[]` 包含 `path: "orders"` 和 `path: "orders/:orderId"`
- **THEN** 顶层 Tab 栏 SHALL 只显示 `orders` 页面
- **AND** `orders/:orderId` MUST NOT 出现在顶层 Tab 栏中

#### Scenario: 无子路径时重定向到第一个顶层页面

- **WHEN** 用户访问 APP 根路径
- **THEN** 系统 SHALL 重定向到 `pages[]` 中第一个顶层页面

### Requirement: 页面内子页面 Tab 仅显示直接静态子页面

系统 SHALL 在当前页面上下文中，仅展示直接静态子页面作为页面内子页面 Tab。直接静态子页面是指：相对父页面路径只多出一个路径段，且该新增路径段不是参数段。系统 MUST NOT 将参数化详情页本身渲染为子页面 Tab。

#### Scenario: 参数化详情页不显示为子页面 Tab

- **WHEN** `pages[]` 包含 `orders`、`orders/new` 与 `orders/:orderId`
- **AND** 用户位于 `orders`
- **THEN** 页面内子页面 Tab SHALL 只显示 `orders/new`
- **AND** `orders/:orderId` MUST NOT 出现在子页面 Tab 中

#### Scenario: 当前子页面没有子页面时沿父级显示同级切换

- **WHEN** `pages[]` 包含 `orders/:orderId`、`orders/:orderId/refund` 与 `orders/:orderId/logs`
- **AND** 用户位于 `orders/1024/refund`
- **THEN** 页面内子页面 Tab SHALL 显示 `refund` 与 `logs`
- **AND** 当前 `refund` 页面 SHALL 处于激活状态

#### Scenario: 只有一个可见子页面时隐藏子页面 Tab

- **WHEN** 当前页面上下文下只有一个直接静态子页面
- **THEN** 系统 MUST NOT 渲染子页面 Tab

### Requirement: 系统根据 URL 层级构建多级面包屑

系统 SHALL 根据当前 URL 子路径的层级结构构建面包屑导航链。面包屑 SHALL 以 APP 名称为根，后续每级为 URL 路径从左到右逐段累积匹配到的页面。

#### Scenario: 多级面包屑正确渲染

- **WHEN** 用户位于 URL 子路径 `orders/1024/refund`
- **AND** `pages[]` 中存在 `orders`、`orders/:orderId`、`orders/:orderId/refund` 三个页面
- **THEN** 面包屑 SHALL 渲染为 `APP名 / 订单列表 / 订单 #1024 / 申请退款`

#### Scenario: 面包屑中间节点可点击跳转

- **WHEN** 面包屑显示多级路径
- **THEN** 除最后一级外，其余面包屑节点 SHALL 可点击跳转到对应路径

#### Scenario: 面包屑跳过无页面定义的中间层级

- **WHEN** URL 子路径为 `orders/1024/refund`
- **AND** `pages[]` 中不存在 `orders/:orderId` 页面
- **THEN** 面包屑 SHALL 渲染为 `APP名 / 订单列表 / 申请退款`

#### Scenario: 顶层页面不显示面包屑

- **WHEN** 用户位于顶层页面 `orders`
- **THEN** 系统 MUST NOT 渲染 breadcrumb

#### Scenario: 二级及以上页面显示面包屑

- **WHEN** 用户位于 `orders/1024`
- **AND** `pages[]` 中存在 `orders` 与 `orders/:orderId`
- **THEN** 系统 SHALL 渲染 `APP名 / 订单列表 / 订单 #1024`

### Requirement: 页面标题支持路径参数表达式

页面 `title` 字段 SHALL 支持 `${params.xxx}` 表达式语法。系统在面包屑和页面标题显示中 SHALL 使用当前路径参数对表达式进行求值替换。

#### Scenario: 动态标题在面包屑中正确渲染

- **WHEN** 页面定义 `title: "订单 #${params.orderId}"`
- **AND** 当前路径参数 `orderId` 值为 `"1024"`
- **THEN** 面包屑中该页面标题 SHALL 显示为 `"订单 #1024"`

### Requirement: Link action 支持基于当前页面路径解析相对 URL

当页面中的 `link` action 使用相对 URL 时，系统 SHALL 基于当前页面的已解析 URL 路径进行拼接，再执行页面匹配流程。绝对 URL SHALL 继续从 APP 根路径解析。

#### Scenario: 从详情页跳转到同级子路径

- **WHEN** 当前页面 URL 子路径为 `orders/1024`
- **AND** 某个 `link` action 定义为 `{ "type": "link", "url": "refund" }`
- **THEN** 系统 SHALL 将目标 URL 解析为 `/orders/1024/refund`

#### Scenario: 绝对路径 link 直接跳转到指定页面

- **WHEN** 当前页面 URL 子路径为 `orders/1024`
- **AND** 某个 `link` action 定义为 `{ "type": "link", "url": "/stats" }`
- **THEN** 系统 SHALL 将目标 URL 解析为 `/stats`
