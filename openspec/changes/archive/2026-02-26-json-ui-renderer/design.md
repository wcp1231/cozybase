## Context

cozybase 后端能力已就绪：Auto CRUD API 提供标准化的数据操作接口，Custom Functions 提供自定义业务逻辑，MCP 工具让 Agent 可以管理 APP 文件。现在缺少的是 UI 层——让用户能通过浏览器与 APP 交互。

当前 monorepo 结构为 `packages/server`（后端）、`packages/admin`（空）、`packages/sdk`（空）。

核心约束：
- UI 定义由 Agent 生成和修改，格式必须对 LLM 友好
- APP 的 UI 交互复杂度有限（主要是 CRUD 工具类应用），不需要通用低代码引擎
- cozybase 是 Local BaaS，UI 应该内置、开箱即用

## Goals / Non-Goals

**Goals:**

- 定义一套 JSON DSL 来描述 APP 的 UI 页面结构、数据绑定和交互行为
- 实现一个轻量级 JSON-to-React 渲染引擎
- 提供 MVP 内置组件集覆盖常见 CRUD 场景
- Admin SPA 壳子可以加载并渲染任意 APP 的 UI
- Server 内置 serve 静态 admin 文件，开箱即用

**Non-Goals:**

- 不实现通用低代码平台（不做可视化拖拽编辑器）
- 不实现 TSX 自定义组件逃生舱（MVP 阶段仅支持 JSON 组合式自定义组件）
- 不实现结构化 MCP UI 操作工具（MVP 阶段使用 `update_app_file` 文件级操作）
- 不实现主题系统或多皮肤
- 不实现国际化 (i18n)
- 不做移动端适配

## Decisions

### Decision 1: JSON 作为 UI 定义格式（而非 YAML 或 TSX）

**选择**: JSON

**理由**: cozybase 的目标是让用户不直接接触代码，UI 定义主要由 Agent 生成和修改。JSON 对 LLM 更友好——结构明确、不存在缩进错误、解析无歧义。虽然 YAML 可读性更好，但在 Agent-first 的场景下，可靠性优先于可读性。

**备选方案**:
- YAML：可读性好但缩进敏感，Agent 容易生成格式错误的内容
- TSX：表达力最强但太重，Agent 生成容易出错，用户无法直观理解

### Decision 2: 自定义 DSL 参考 Amis 设计理念（而非直接使用 Amis）

**选择**: 自定义 JSON DSL，参考 Amis 的 action 系统和组件通信模式

**理由**: Amis 有 130+ 组件，大部分 cozybase 用不到。Amis 的 API 适配协议与 cozybase 的 Auto CRUD API 不匹配，需要额外适配层。自定义 DSL 可以原生支持 cozybase 的 `/db/xxx` 和 `/functions/xxx` 路径约定，且保持 schema 简洁，降低 Agent 生成错误率。

**借鉴 Amis 的部分**:
- Action 类型体系（api / dialog / reload / link / close / confirm）
- `${xxx}` 表达式语法的作用域设计
- 组件间通过 `id` + `target` 通信的模式

**备选方案**:
- 直接集成 Amis：包体积大、需要适配层、Agent 难以正确生成复杂 Amis schema
- Formily：专注表单，覆盖场景太窄

### Decision 3: 包拆分为 `packages/ui` + `packages/admin`（二分方案）

**选择**: `packages/ui` 作为独立渲染库，`packages/admin` 作为 SPA 壳子

**理由**: `packages/ui` 只接收 JSON schema + `baseUrl`，不知道 cozybase server 的存在。这个解耦带来三个好处：
1. **独立测试** —— UI 渲染可以用纯单元测试（JSON 输入 → React 组件树输出），无需启动 server
2. **独立开发** —— 渲染引擎和 admin 壳子可以并行开发
3. **明确契约** —— 包边界强制定义清晰的 API

`packages/ui` 规则：依赖 React 和 UI 组件库；不依赖 server、admin、不直接调用任何 API（通过 `baseUrl` + 相对路径委托给外部）。

`packages/admin` 规则：依赖 `@cozybase/ui`；负责路由、API 调用、鉴权、导航；不依赖 server 内部模块。

**备选方案**:
- 全部放在 `packages/admin`：耦合度高，渲染器无法独立测试
- 三分（额外拆出 `ui-types`）：类型代码量很小，单独成包维护成本不值得

### Decision 4: 渲染器采用 Direct Mapping 架构

**选择**: 递归组件映射 + 四个核心模块

**架构**:

```
SchemaRenderer (入口)
  │
  ├── ComponentRegistry   type 字符串 → React 组件
  ├── ActionDispatcher    声明式 action → 副作用执行
  ├── ExpressionResolver  ${xxx.yyy} → 实际值
  └── PageContext          组件状态注册 + 跨组件引用
```

核心渲染逻辑是一个递归函数：
```typescript
function renderNode(schema: ComponentSchema): React.ReactNode {
  const Component = registry.get(schema.type)
  const children = schema.children?.map(renderNode)
  return <Component {...resolveExpressions(schema)}>{children}</Component>
}
```

**理由**: 这是最简单的方案，容易理解和调试。四个模块各自职责清晰，总代码量预计在 500 行以内。后续如需支持插件系统或中间件，可以在此基础上演进到 Runtime Engine 架构。

**备选方案**:
- 中间层架构（Amis 风格）：引入 Parser → Runtime → Renderer 三层，MVP 过重
- Schema → Store → View（响应式）：引入 MobX/Signals 等响应式系统，学习成本过高

### Decision 5: Expression 作用域设计

**选择**: 有限的、可枚举的作用域，而非通用 JS 表达式引擎

**作用域**:
| 语法 | 含义 | 可用位置 |
|------|------|----------|
| `${componentId.value}` | 其他组件的当前值 | 任意 |
| `${componentId.data}` | 其他组件的 API 数据 | 任意 |
| `${row.xxx}` | 表格当前行的字段 | table 的 columns/rowActions 内 |
| `${form.xxx}` | 当前表单的字段值 | form 内 |
| `${params.xxx}` | URL query 参数 | 任意 |
| `${response.xxx}` | API 返回值 | onSuccess/onError 回调内 |

MVP 阶段支持简单的属性访问和比较表达式（如 `${row.completed === 1}`），不支持复杂的逻辑运算或函数调用。

**理由**: 限定作用域可以避免安全风险（不执行任意 JS），同时让 Agent 生成的表达式更可预测。复杂逻辑应该放在 Functions 中处理，UI 层只做简单的数据绑定和条件判断。

### Decision 6: Action 类型体系

**选择**: MVP 阶段 6 种 action 类型

| Action | 说明 | 参数 |
|--------|------|------|
| `api` | 发起 HTTP 请求 | `method`, `url`, `body`, `onSuccess`, `onError` |
| `reload` | 刷新某个组件的数据 | `target` (组件 id) |
| `dialog` | 打开弹窗 | `title`, `body` (组件 schema) |
| `link` | 页面跳转 | `url`, `params` |
| `close` | 关闭当前弹窗 | 无 |
| `confirm` | 确认提示后执行后续 action | `message`, `onConfirm` |

Action 可以组合为数组顺序执行，支持 `onSuccess` / `onError` 回调链。

**理由**: 这 6 种 action 覆盖了 CRUD 应用的核心交互模式。参考 Amis 的 action 体系但大幅精简——Amis 有 30+ 种 action，大多数在 cozybase 场景下用不到。

### Decision 7: URL 使用 App 相对路径

**选择**: JSON 中的 API URL 为 App 内相对路径，渲染器根据当前 App 和运行模式自动补全

**示例**:
```
JSON 中写:     "/db/todo"
渲染器补全为:  "/stable/apps/welcome/db/todo"
```

**理由**: 这利用了 cozybase Auto CRUD API 路径可预测的天然优势。JSON 定义更简洁，Agent 不需要硬编码完整路径，App 改名时 UI 定义不需要修改。渲染器通过 `SchemaRenderer` 入参的 `baseUrl` 获取当前 App 的 API 前缀。

### Decision 8: Admin 静态文件由 Server 内置 serve

**选择**: Build 时将 `packages/admin` 打包为静态文件，`packages/server` 的 Hono 直接 serve

**理由**: cozybase 定位是 Local BaaS，核心价值是本地、自包含、开箱即用。内置 serve 保证单进程部署，前后端版本总是匹配，用户体验更简单。

**构建流程**:
1. `packages/ui` → build 为 ESM 库
2. `packages/admin` → build 为静态 SPA（引用 `@cozybase/ui`）
3. `packages/server` → 将 admin 产物嵌入，Hono 静态中间件 serve

### Decision 9: MVP 内置组件集范围

**选择**: 23 个基础组件，分 5 类

| 类别 | 组件 | 数量 |
|------|------|------|
| 布局 | `page`, `row`, `col`, `card`, `tabs`, `divider` | 6 |
| 数据展示 | `table`, `list`, `text`, `heading`, `tag`, `stat` | 6 |
| 数据输入 | `form`, `input`, `textarea`, `number`, `select`, `switch`, `checkbox`, `radio`, `date-picker` | 9 |
| 操作 | `button`, `link` | 2 |
| 反馈 | `dialog`, `alert`, `empty` | 3 |

MVP 核心（可最先实现的 6 个）：`table`、`form`、`button`、`dialog`、`card`、`tabs`

**理由**: 这 23 个组件参考了 Ant Design 和 Amis 的高频组件列表，覆盖了绝大多数 CRUD 内部工具的 UI 需求。MVP 阶段先实现 6 个核心组件即可支撑 Welcome TODO App。

### Decision 10: 支持 JSON 组合式自定义组件

**选择**: APP 可以在 `pages.json` 中通过 `components` 字段声明可复用的组件模板，由已有基础组件组合而成

**示例**:
```json
{
  "components": {
    "todo-card": {
      "props": {
        "title": { "type": "string", "required": true },
        "completed": { "type": "boolean", "default": false }
      },
      "body": {
        "type": "card",
        "children": [
          { "type": "text", "text": "${props.title}" },
          { "type": "switch", "value": "${props.completed}" }
        ]
      }
    }
  }
}
```

**理由**: 纯 JSON 组合不需要编写任何代码，Agent 可以完全掌控。组件模板支持 `props` 声明和 `${props.xxx}` 引用，渲染器在遇到自定义 type 时从 `components` 注册表中查找模板并展开渲染。

## Risks / Trade-offs

**[Expression 注入风险]** → `${xxx}` 表达式如果支持复杂逻辑（如函数调用），可能存在安全风险。缓解措施：MVP 阶段限制为属性访问和简单比较，不支持任意 JS 执行。Expression Resolver 使用白名单解析而非 `eval()`。

**[JSON Schema 膨胀]** → 随着组件和 action 类型增多，JSON 定义可能变得冗长，增加 Agent 的 token 消耗。缓解措施：保持合理的默认值（convention over configuration），组合式自定义组件减少重复。

**[渲染器性能]** → 每次 state 变化都重新 resolve 所有表达式可能影响性能。缓解措施：MVP 阶段 APP 规模有限，性能问题不显著。后续可以引入 memoization 或响应式更新机制。

**[组件样式一致性]** → 自定义 DSL 需要自己实现组件样式，不像 Amis 有成熟的样式体系。缓解措施：基于 Radix UI / shadcn 等无样式组件库构建，复用社区的样式方案。

**[文件级 MCP 操作的局限]** → Agent 每次操作需要输出整个 `pages.json` 文件，UI 复杂时 token 消耗大。缓解措施：MVP 阶段 APP UI 不复杂（几十到几百行 JSON），文件级操作可接受。后续可引入结构化 MCP 工具（`ui_add_component`、`ui_update_component` 等）减少 token 消耗。

## Open Questions

- **UI 基础组件库选型**: 使用 Radix UI + 自定义样式、shadcn/ui、还是完全自己实现？这会影响 `packages/ui` 的依赖和样式方案。
- **Admin 路由方案**: 使用 React Router 还是 TanStack Router？是否需要 SSR？
- **App UI 的 Draft/Stable 区分**: UI 定义（`pages.json`）是否也区分 Draft 和 Stable 版本？修改 UI 后是否需要 Reconcile + Publish？
