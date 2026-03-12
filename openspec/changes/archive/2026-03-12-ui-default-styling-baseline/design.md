## Context

Cozybase 的 JSON-to-UI 已经具备三块相关基础：

- `SchemaRenderer` 统一负责将 `ui/pages.json` 递归渲染为 React 组件
- 多个内置组件已经内嵌了局部基础样式，例如 `card`、`button`、`input`、`table`
- theme token 已通过 `--cz-*` CSS 变量暴露，默认主题和运行时主题更新链路已经存在

但当前默认视觉能力仍然是“分散的、组件各自为战的”：

- 一部分组件有基础视觉，一部分组件几乎是裸结构
- 页面骨架组件（`page`、`row`、`col`、`text`、`heading`、`list`）缺少统一的排版和留白基线
- `pages.json` 中的 `style` / `className` 是显式声明，但系统没有一个统一的“未声明时如何兜底”的默认层

结果是：Agent 只要没有显式生成样式，页面虽然能渲染，但整体常常呈现为松散、单薄、缺乏节奏的默认 HTML 结构。

本次 change 的目标不是引入新的样式 DSL，也不是做可视化样式编辑，而是建立一个稳定、可覆盖、可复用 theme token 的默认视觉基线。

```text
目标链路

pages.json
   │
   ▼
显式 schema props / style / className
   │
   ▼
默认样式层（仅在未显式声明时兜底）
   │
   ▼
组件内部结构性基础样式
   │
   ▼
最终渲染 UI
```

## Goals / Non-Goals

**Goals:**

- 为内置组件建立统一的默认视觉基线，减少 Agent 漏写样式时的“裸 UI”观感
- 明确默认样式层与显式 schema 样式、组件内部基础样式之间的优先级
- 让默认视觉优先复用现有 theme token，而不是引入新的主题系统
- 保持 `ui/pages.json` 的持久化内容只表达显式意图，不混入运行时兜底样式
- 让 Draft 预览、Stable 预览和可视化编辑器预览共享同一套默认视觉行为

**Non-Goals:**

- 不新增新的 JSON 样式语法或嵌套样式能力
- 不将默认样式写回 `ui/pages.json`、MCP 返回值或页面编辑草稿
- 不为组件内部所有子元素暴露新的细粒度样式 schema 字段
- 不在本次 change 中引入 `unstyled`、`appearance` 等新的 opt-out schema 字段
- 不改变自定义组件的声明模型；默认样式只覆盖内置组件，自定义组件通过其内部使用的内置组件间接受益

## Decisions

### D1: 默认样式层只存在于运行时渲染阶段，不进入 schema 归一化或持久化流程

**选择**: 默认样式在 `@cozybase/ui` 的渲染路径中合并，不修改 `normalizePagesJson()`、`page-editor` 或写回到 `ui/pages.json` 的任何内容。

**理由**:

- 将默认样式写入 `normalizePagesJson()`、编辑器默认节点或 Agent 生成结果，都会把展示层兜底值固化为持久化数据，导致 schema 变脏、diff 噪声增大、未来改默认设计语言时需要迁移历史 JSON
- 运行时默认层可以在不改变数据模型的前提下统一改善所有入口的预览效果

### D2: 采用“双层基线”而不是把所有默认视觉都塞进一个 defaults map

**选择**: 将默认视觉拆为两层：

- `schema defaults layer`：面向组件根节点和公开 schema 属性的兜底值
- `component internal base styles`：组件内部子结构所需的基础样式，继续保留在组件实现内部

**理由**:

- 仅靠统一 defaults registry 无法优雅表达 `table` 表头、`card` 标题区、`button` loading/disabled 状态等内部子结构样式
- 继续完全分散在组件文件中，又无法为 `page`、`row`、`col`、`text`、`heading` 这类骨架组件建立统一的根节点兜底语义
- 双层结构能把“根节点可配置默认值”和“内部结构性样式”清晰分开

### D3: 默认合并遵循“显式优先”，且只对 `undefined` 字段兜底

**选择**: 默认值合并使用以下规则：

- 标量 schema 字段：仅当字段值为 `undefined` 时应用默认值
- `style`：以浅合并方式处理，等价于 `{ ...defaultStyle, ...explicitStyle }`
- `className`：默认类名在前，显式类名在后，保证显式 Tailwind utility 有覆盖机会

**理由**:

- 使用 truthy/falsy 判断会错误覆盖 `gap: 0`、`padding: 0`、`variant: "ghost"` 这类合法显式值
- 当前 `style` 契约本身就是 shallow object，没有深合并必要
- 让显式类名直接替换默认类名，会丢失默认类名中的无冲突基础 utility

### D4: 默认样式优先表达为 theme-token-aware 的 root 级视觉语义

**选择**: 默认样式以现有 `--cz-*` 变量为基础，优先覆盖以下维度：

- 页面级留白与段落节奏
- 文本层级与默认文字颜色
- 容器的基础 surface、border、radius、shadow
- 常见空状态、列表、表格外层容器的基础视觉

**理由**:

- 直接写死颜色和字体会绕开现有主题系统，破坏主题切换与 workspace token 覆盖
- 只做 spacing 而不做 typography / surface，无法真正解决“看起来太丑”的问题，尤其是排版和 surface 弱的问题

### D5: 首轮实现覆盖全部内置组件，并优先统一页面骨架、表单交互和常见显示组件的默认基线

**选择**: 首轮实现覆盖全部内置组件，并按以下优先顺序组织接入与评审：

- `page`
- `row`
- `col`
- `text`
- `heading`
- `tabs`
- `form`
- `input`
- `textarea`
- `number`
- `select`
- `switch`
- `checkbox`
- `radio`
- `date-picker`
- `list`
- `card`
- `table`
- `divider`
- `tag`
- `stat`
- `button`
- `link`
- `dialog`
- `alert`
- `empty`

其中页面骨架、`tabs` / `form` 与输入组件是首轮重点，因为它们最直接决定 Agent 未补样式时的整体观感与可用性；已经拥有成熟内部视觉的组件也必须纳入统一评估，至少确认其现有基础样式与新的默认契约兼容。

**理由**:

- 如果只覆盖少数组件，默认视觉基线会在真实页面中出现明显断层
- `tabs` / `form` 与输入组件是用户最常见的结构节点，不纳入首轮会直接削弱这次 change 的体感收益
- 对已有内部样式的组件进行兼容性评估，可以避免新的 defaults contract 与旧实现互相打架

### D6: 默认样式入口放在渲染器共享路径，而不是每个组件自行感知“是否缺省”

**选择**: 在 `SchemaRenderer` 的 schema 预处理路径中增加 builtin defaults 合并步骤，使绝大多数组件拿到的都是“已完成兜底合并”的 schema。

**理由**:

- 让每个组件各自处理缺省值会继续分散逻辑，无法统一测试默认优先级
- 在 registry 层包装高阶组件会增加一层抽象，不如在已有的 schema 预处理阶段统一完成

## Risks / Trade-offs

- **默认视觉导致已有页面观感变化** → 将首轮默认值控制为“保守增强”，避免大幅改变已存在显式样式页面；增加渲染快照或 DOM 断言测试覆盖关键组件
- **根节点默认值不足以覆盖复杂组件内部视觉** → 明确 defaults layer 只负责根节点和公开 schema 字段，内部结构样式继续留在组件实现中
- **Tailwind utility 拼接顺序带来覆盖不确定性** → 约定默认类名前置、显式类名后置，并尽量减少相互冲突的默认 utility
- **默认值散落在多个组件和 defaults registry 中再次失控** → 将“根节点默认值”集中定义在共享 registry 中，组件文件只保留内部结构性样式
- **没有 opt-out 可能让极简页面受限** → 首轮默认值保持轻量；是否需要 `unstyled` 作为后续独立 change 再评估

## Migration Plan

1. 在 `@cozybase/ui` 中引入共享的 builtin defaults 定义和合并函数
2. 将 `SchemaRenderer` 接入默认值合并路径，并补充 merge 语义测试
3. 逐步将全部内置组件接入统一默认视觉基线，保留必要的组件内部结构样式
4. 更新 UI 指南，明确 `schema props > style > className` 与默认视觉基线的推荐使用顺序
5. 按组件类别完成全部内置组件的默认基线评估与接入，确认 `tabs` / `form` / 输入组件与既有显示组件都落入统一契约
6. 使用现有页面和欢迎模板进行回归检查，确认不需要对历史 `pages.json` 做迁移

**Rollback**:

- 若默认视觉引发明显回归，可在实现层面回退共享 defaults 合并逻辑，不涉及数据迁移或持久化回滚

## Open Questions

- 是否需要为后续版本预留组件级 opt-out 机制，例如 `unstyled: true` 或 `appearance: "plain"`？
- 默认视觉对于 `tabs`、`form` 等交互密集组件，应当覆盖到什么程度的 root-level 语义，才能既提升观感又不与内部状态样式冲突？
- Agent prompt / guide 是否需要补充“优先依赖默认视觉基线，按需再添加 style”这类显式约束，还是只更新文档即可？
