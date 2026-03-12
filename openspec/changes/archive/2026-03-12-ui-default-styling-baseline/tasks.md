## 1. 默认样式契约与合并入口

- [x] 1.1 在 `packages/ui` 中新增内置组件默认视觉配置与共享合并函数，明确标量字段、`style`、`className` 的默认值合并规则
- [x] 1.2 改造 `SchemaRenderer` 的 schema 预处理链路，在不影响自定义组件展开语义的前提下接入内置组件默认样式层
- [x] 1.3 为默认值合并逻辑补充单元测试，覆盖 `undefined` 才兜底、`gap: 0` 等 falsy 显式值保留、`style` 浅合并和 `className` 优先级

## 2. 内置组件默认视觉基线接入

- [x] 2.1 为 `page`、`row`、`col`、`text`、`heading`、`divider`、`tag`、`stat` 建立统一的页面骨架与显示组件默认基线
- [x] 2.2 为 `tabs`、`form`、`input`、`textarea`、`number`、`select`、`switch`、`checkbox`、`radio`、`date-picker` 建立统一的交互与表单默认基线
- [x] 2.3 为 `list`、`card`、`table`、`button`、`link`、`dialog`、`alert`、`empty` 评估并接入默认视觉，确保其现有内部样式与新的默认契约兼容

## 3. 指南与作者体验

- [x] 3.1 更新 `packages/daemon/guides/ui/index.md` 与 `packages/daemon/guides/ui/styling.md`，说明默认视觉基线的存在、覆盖顺序以及何时仍需要显式 `style` / `className`
- [x] 3.2 更新相关组件指南，减少对重复样式样板代码的依赖，并明确默认视觉不会写回 `ui/pages.json`

## 4. 回归验证

- [x] 4.1 为 `packages/ui` 渲染器与关键组件补充回归测试，验证无显式样式时的默认视觉基线和显式覆盖优先级
- [x] 4.2 补充 theme 相关验证，确保修改 `--cz-*` token 后默认视觉能随主题变化而更新
- [x] 4.3 补充持久化回归验证，确保预览、编辑或节点读取不会把运行时默认样式自动写入 `ui/pages.json` 或 `ui_get` 结果
