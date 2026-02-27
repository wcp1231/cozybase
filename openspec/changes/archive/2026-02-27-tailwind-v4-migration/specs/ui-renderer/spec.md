## MODIFIED Requirements

### Requirement: SchemaRenderer 入口组件

SchemaRenderer 的渲染职责不变。样式实现 SHALL 从 inline style 切换为 Tailwind utility class。

SchemaRenderer 内部的 DialogLayer 遮罩、未知组件错误占位符、ErrorBoundary 等 SHALL 使用 Tailwind class 定义样式。

#### Scenario: DialogLayer 使用 Tailwind class

- **WHEN** SchemaRenderer 渲染 DialogLayer 遮罩
- **THEN** 遮罩元素 SHALL 使用 Tailwind class（如 `fixed inset-0`）渲染，不使用 inline style 定义位置和颜色

#### Scenario: 未知组件错误使用 Tailwind class

- **WHEN** 遇到未注册的组件类型
- **THEN** 错误占位符 SHALL 使用语义色 Tailwind class（如 `bg-error-bg text-error-text border border-error-border`）渲染

#### Scenario: ErrorBoundary 使用 Tailwind class

- **WHEN** 组件渲染抛出异常
- **THEN** ErrorBoundary 的 fallback UI SHALL 使用 Tailwind class 渲染

### Requirement: 主题支持

SchemaRenderer SHALL 通过 Tailwind utility class 消费 `@theme` 中定义的 design token，token 底层引用 `--cz-*` CSS Variables。

`<style id="cz-theme">` 注入机制 SHALL 继续作为运行时 theme 自定义入口。Tailwind `@theme` 中的 `var(--cz-*, fallback)` 确保有无注入都能正常渲染。

`generateThemeCSS()` 函数 SHALL 保持不变，继续生成 `:root { --cz-*: value }` CSS 变量声明。

#### Scenario: 有 theme 注入时 Tailwind 跟随

- **WHEN** HTML 中注入了 `<style id="cz-theme">` 覆盖 `--cz-primary`
- **THEN** SchemaRenderer 中使用 `bg-primary` 的组件 SHALL 渲染为注入的颜色值

#### Scenario: 无 theme 注入时使用 fallback

- **WHEN** SchemaRenderer 在无 `<style id="cz-theme">` 的环境中渲染
- **THEN** 所有组件 SHALL 使用 `@theme` 中的 fallback 默认值正常渲染
