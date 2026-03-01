## Context

当前 Admin UI 通过 `AppPageView` 直接渲染 `<SchemaRenderer>`，App UI 与 Admin 共享同一个 React 树和路由系统。Agent 开发 APP 时有 `execute_sql` 和 `call_api` 验证数据层，但完全无法感知 UI 层的渲染结果。

Agent 由 Daemon 通过 Claude Agent SDK 在服务端启动，Admin UI 显示 Agent 聊天交互界面。Agent 进程在服务端，App UI 在用户浏览器的 Admin 页面中直接渲染——两者之间需要一条完整的调用链路。

本设计围绕 "直接 DOM 检查 + WebSocket 中继" 这一核心方案展开。

涉及的模块关系：

```
Daemon (Server)                         Admin UI (Browser)
┌──────────────────┐                   ┌──────────────────────────────┐
│ Agent (Claude SDK)│                   │                              │
│   │               │                   │  ChatPanel (显示 Agent 对话) │
│   │ tool call:    │                   │                              │
│   │ inspect_ui    │    WebSocket      │  BridgeClient                │
│   ▼               │◄─────────────────►│   │                          │
│ Tool Handler      │                   │   │ 直接 DOM 检查             │
│                   │                   │   ▼                          │
│                   │                   │  AppPageView                 │
│                   │                   │   └── <SchemaRenderer>       │
│                   │                   │        └── [data-schema-id]  │
└──────────────────┘                   └──────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**

- App UI 通过 `<SchemaRenderer>` 在 Admin 中直接渲染，保持与数据驱动渲染一致
- Agent 能通过 `inspect_ui` 获取结构化的 UI 状态树（组件类型、文本内容、数据、可见性）
- 通信协议可扩展，支持后续添加交互模拟能力
- `data-schema-id` 标记使 Agent 能以 schema 语义定位组件

**Non-Goals:**

- 本阶段不实现交互模拟（click/fill/submit），留作 Phase 2
- 本阶段不实现截图（`screenshot_ui`），留作 Phase 2
- 不为 CLI MCP Agent 提供 UI 验证能力（需要 headless browser，属于独立方案）
- 不改变 Runtime standalone 模式的行为

## Decisions

### Decision 1: SchemaRenderer 直接渲染（非 iframe）

**选择**: `AppPageView` 直接使用 `<SchemaRenderer>` 渲染 App UI，不使用 iframe

**曾考虑的替代方案**: iframe 隔离渲染（曾实施后回退）

**理由**:
- iframe 中的 dialog overlay 只覆盖 iframe 区域，无法覆盖整个视口；dialog 内容可能溢出 iframe 边界被裁切
- iframe 内使用 hash 路由（`#pageId`）避免重载，与 Admin 的 path 路由需要额外的 postMessage 同步逻辑
- iframe 加载存在白屏问题（每次页面切换需完整加载）
- SchemaRenderer 是数据驱动的纯组件，接收 JSON schema → 渲染 UI，不依赖运行环境。daemon/runtime 分进程后仍可通过 HTTP 获取 schema JSON 传入 SchemaRenderer
- Admin 已引入 `@cozybase/ui` 包和基础 CSS（`base.css`），theme CSS 由 daemon 注入 `<style id="cz-theme">` 到 Admin HTML，样式兼容无问题

### Decision 2: Admin 端直接 DOM 检查（非 postMessage 中继）

**选择**: Admin 在 BridgeClient handler 中直接调用 `inspectPage()` 遍历自身 DOM

**曾考虑的替代方案**: 通过 postMessage 将 inspect 请求中继到 iframe 内的 bridge.js

**理由**:
- SchemaRenderer 直接渲染在 Admin DOM 中，Admin 完全可以访问这些 DOM 元素
- 省去 postMessage 中继层，调用链路从 Agent→WebSocket→BridgeClient→postMessage→bridge.js→DOM 简化为 Agent→WebSocket→BridgeClient→DOM
- `data-schema-id` 属性在 Admin DOM 中直接可用，`inspectPage()` 函数执行纯 DOM 遍历即可
- 减少代码量和调试复杂度（无需管理 bridge:ready 状态、postMessage origin 校验、10s 超时等）

**DOM 检查入口**:
```typescript
// packages/admin/src/lib/ui-inspector.ts
export function inspectPage(root: Element, pageId: string): InspectResult
```

通过 `document.getElementById('cz-app-content')` 获取 App 渲染区域根元素。

### Decision 3: data-schema-id 标记策略

**选择**: `NodeRenderer` 为每个组件的 DOM wrapper 添加 `data-schema-id` 属性

**ID 生成规则**:
- 如果 schema 节点有 `id` 字段（如 `"id": "users-table"`），使用该 `id`
- 否则使用 `{type}-{index}`（如 `heading-0`、`button-1`）作为自动 ID

**实现位置**: `NodeRenderer` 内部，在 `<ErrorBoundary>` 外层包裹一个 `<div data-schema-id="xxx">` + `data-schema-type`。

**选择包裹 div**:
- `cloneElement` 需要组件根元素支持 `data-*` 属性透传，对所有内置组件有侵入性
- 包裹 div 不依赖组件实现，更稳定
- 包裹 div 使用 `display: contents` 避免影响布局

```tsx
<div data-schema-id={schemaId} data-schema-type={schemaType} style={{ display: 'contents' }}>
  <ErrorBoundary type={schemaType}>
    <Comp ... />
  </ErrorBoundary>
</div>
```

### Decision 4: inspect_ui 返回结构设计

**选择**: 返回一棵组件树，每个节点包含类型、文本内容、数据摘要和子节点

```typescript
interface InspectResult {
  page: {
    id: string;
    title: string;
  };
  tree: InspectNode[];
}

interface InspectNode {
  schemaId: string;          // data-schema-id 的值
  type: string;              // 组件类型: table, button, form, ...
  text?: string;             // 文本内容（heading, text, button label 等）
  visible: boolean;
  data?: {
    rows?: number;           // table/list 的行数
    columns?: string[];      // table 的列名
    items?: unknown[];       // 前 N 行数据预览
  };
  form?: {
    fields?: string[];       // form 的字段名列表
    values?: Record<string, unknown>;  // 当前表单值
  };
  actions?: string[];        // 可用的 action 描述
  state?: {
    loading?: boolean;
    error?: string;
    disabled?: boolean;
  };
  children?: InspectNode[];  // 子组件
}
```

**设计原则**:
- 按组件类型提取最有意义的信息，而非 dump 整个 DOM
- 数据预览限制条数（如 table 只返回前 5 行），避免消息过大
- 返回结构与 schema 组件类型对齐，Agent 无需理解 HTML/DOM

### Decision 5: Admin 端导航（React Router 直接控制）

**选择**: Admin 使用 React Router 直接控制页面导航，SchemaRenderer 的 `navigate` prop 调用 `useNavigate()`

**流程**:
1. 用户在 Admin sidebar 点击页面链接 → React Router 更新 URL → `subPath` 参数变化 → 渲染对应 page schema
2. App 内部 Link 组件点击 → SchemaRenderer 的 `navigate` 回调 → 调用 `nav(url)` → React Router 处理
3. Agent 请求 inspect 指定页面 → BridgeClient handler 调用 `nav()` 切换页面 → 等待 React 重渲染 → 执行 DOM 检查

**理由**:
- SchemaRenderer 中的 `resolveUrl()` 生成的是 Admin 兼容的路径（如 `/draft/apps/baby-allergy/records?baby_id=1`），直接可用于 React Router
- 无需 iframe src 同步、hash 路由转换或 postMessage 导航协调
- 页面切换无白屏（React vDOM diff，局部更新）

### Decision 6: Agent → Browser 通信链路（WebSocket 直达）

**选择**: Daemon 与 Admin UI 之间通过 WebSocket 建立连接，BridgeClient 接收请求后直接在 Admin 执行 DOM 检查

**完整调用链路**:

```
Agent (Claude SDK)                      Admin UI (Browser)
      │                                       │
      │ 1. tool_call: inspect_ui               │
      ▼                                       │
Tool Handler (Daemon)                         │
      │                                       │
      │ 2. ws.send({                           │
      │      type: 'ui:request',               │
      │      id: 'req-123',                    │
      │      method: 'inspect',                │
      │      params: { page: 'records' }       │
      │    })                                  │
      │ ─────────── WebSocket ───────────────► │
      │                                       │
      │                              3. BridgeClient
      │                                 接收 ws 消息
      │                                       │
      │                              4. inspectPage()
      │                                 直接遍历 DOM
      │                                 [data-schema-id]
      │                                       │
      │ ◄─────────── WebSocket ──────────────  │
      │ 5. ws.receive({                        │
      │      type: 'ui:response',              │
      │      id: 'req-123',                    │
      │      result: { ... }                   │
      │    })                                  │
      ▼                                       │
Tool Handler 返回结果给 Agent                  │
```

对比旧方案（7 步 → 5 步），去掉了 postMessage→bridge.js→postMessage 中间层。

**WebSocket 端点**: Daemon 在 `/api/v1/agent/ws` 提供 WebSocket 端点。

**消息协议**:

```typescript
// Daemon → Browser（UI 工具请求）
interface UiToolRequest {
  type: 'ui:request';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

// Browser → Daemon（UI 工具响应）
interface UiToolResponse {
  type: 'ui:response';
  id: string;
  result?: unknown;
  error?: string;
}
```

**无浏览器在线时的行为**: 如果 Admin UI 未连接（用户没打开页面），Tool Handler 直接返回错误 `"No browser session connected. Please open Admin UI to use UI inspection tools."`

### Decision 7: Agent Tool 注册（Claude Agent SDK）

**选择**: 在 Claude Agent SDK 中为 Agent 注册 `inspect_ui` 工具，tool handler 通过 WebSocket 中继请求到浏览器

```typescript
const inspectUiTool = {
  name: 'inspect_ui',
  description:
    'Inspect the rendered UI of a draft app. Returns a structured tree of visible components, ' +
    'their text content, table data, form state, and available actions. ' +
    'Use this after updating UI files and reconciling to verify the UI renders correctly.',
  input_schema: {
    type: 'object',
    properties: {
      app_name: { type: 'string', description: 'The app to inspect' },
      page: { type: 'string', description: 'Page ID to inspect. If omitted, inspects the current page.' },
    },
    required: ['app_name'],
  },
};
```

### Decision 8: BridgeClient API 设计

Admin 端的 `BridgeClient` 封装一层通信：接收 WebSocket 的 `ui:request` 消息，调用注册的 handler 执行检查，将结果通过 WebSocket 以 `ui:response` 回传。

```typescript
export type RequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

class BridgeClient {
  setWebSocket(ws: WebSocket | null): void;
  setHandler(handler: RequestHandler | null): void;

  // 内部：监听 WebSocket 消息，解析 ui:request，调用 handler，发送 ui:response
  private handleWsMessage(event: MessageEvent): void;
  private handleRequest(request: UiToolRequest): Promise<void>;
}
```

**工作流程**:
1. Admin UI（draft 模式）建立 WebSocket 连接后，创建 `BridgeClient` 实例
2. 注册 handler：handler 接收 `(method, params)` 并执行对应逻辑（如 `inspectPage()`）
3. BridgeClient 监听 WebSocket 上的 `ui:request` 消息
4. 收到请求后调用 handler，获取结果
5. 将结果通过 WebSocket 以 `ui:response` 回传给 Daemon

**超时处理**: WebSocket 端 15s 超时（Daemon 侧控制）。

## Risks / Trade-offs

**[`display: contents` 兼容性]** → 现代浏览器（Chrome 65+, Firefox 62+, Safari 11.1+）均支持。CozyBase 的目标用户群使用现代浏览器，风险极低。

**[inspect 返回数据过大]** → 限制数据预览条数（table 前 5 行），嵌套组件树深度上限为 10 层。如果仍然过大，可以支持 `inspect(schemaId)` 只返回子树。

**[schema 节点无 id 时自动 ID 不稳定]** → 自动 ID 基于 type + sibling index（`heading-0`），如果 schema 结构变化，ID 会变。这在同一次验证会话中不是问题（inspect → click 使用同一次 inspect 返回的 ID），但鼓励用户在 schema 中为关键组件指定 `id`。

**[UI 工具依赖浏览器在线]** → Agent 调用 `inspect_ui` 时如果没有浏览器连接，tool 返回明确错误信息。Agent 可以 fallback 到 `call_api` 读取 `pages.json` 进行 schema 级别的验证。

**[Admin CSS 可能影响 App 组件]** → Admin 和 App 共享同一个 CSS 上下文。目前 Admin 使用 Tailwind utility classes 且 App 组件也基于 Tailwind，二者兼容。如果未来出现冲突可通过 CSS scope 或 layer 隔离。
