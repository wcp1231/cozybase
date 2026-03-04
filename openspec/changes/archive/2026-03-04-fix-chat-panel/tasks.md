## 1. 后端 — Assistant 消息即时持久化

- [x] 1.1 修改 `chat-session.ts` 的 `handleUserMessage()`：移除循环外的 `assistantText` 累积变量和循环后的单次 `store.addMessage()` 调用
- [x] 1.2 在 `for-await` 循环内，当 `msg.type === 'assistant'` 且 `extractTextContent(msg.message.content)` 非空时，立即调用 `store.addMessage()` 持久化该 assistant 消息
- [x] 1.3 验证：Agent 执行一轮包含多次工具调用的对话后，检查 `agent_messages` 表中 assistant 记录数量与顺序是否正确

## 2. 后端 — EventBus 桥接 reconcile 通知

- [x] 2.1 在 `LocalBackend.reconcile()` 方法中，reconcile 成功后调用 `eventBus.emit('app:reconciled', { appSlug })` 发布事件
- [x] 2.2 在 `ChatSession` 构造函数中订阅 `eventBus.on('app:reconciled', ...)`，收到事件时检查 `appSlug` 匹配后调用 `sendToWs({ type: 'app:reconciled', appSlug })`
- [x] 2.3 在 `ChatSession.shutdown()` 中取消 EventBus 订阅，防止内存泄漏
- [x] 2.4 更新 `ChatSession` 构造函数签名，接收 `EventBus` 实例；同步更新 `ChatSessionManager` 传入 EventBus
- [x] 2.5 验证：Agent 调用 `reconcile_app` 后，浏览器 WebSocket 收到 `app:reconciled` 消息

## 3. 前端 — chat-store 处理新消息类型

- [x] 3.1 在 `chat-store.ts` 的 `handleMessage()` 中新增 `case 'app:reconciled'`，调用已注册的 `onReconciled` 回调
- [x] 3.2 在 `ChatState` 接口中新增 `onReconciled` 回调注册/注销方法（如 `setOnReconciled(callback | null)`）
- [x] 3.3 验证 `tool_progress` 和 `tool_use_summary` 消息的现有处理逻辑是否正常工作（SDK 确认这两个类型为原生类型），必要时调整字段映射

## 4. 前端 — AppLayout 监听 reconcile 刷新 UI

- [x] 4.1 在 `app-layout.tsx` 中，当 `selectedMode === 'draft' && appName` 时，通过 `useChatStore` 注册 `onReconciled` 回调
- [x] 4.2 回调内部调用 `refreshApp()` 重新 fetch `/${selectedMode}/apps/${appName}/ui` 更新 `pagesJson` 状态
- [x] 4.3 在 `useEffect` 清理函数中注销回调，避免组件卸载后触发更新
- [x] 4.4 验证：Agent 执行 `reconcile_app` 后，页面 `SchemaRenderer` 自动渲染最新 UI 而无需手动刷新

## 5. 前端 — ChatPanel 工具消息可折叠 UI

- [x] 5.1 创建 `ToolBubble` 组件替换 `ChatBubble` 中现有的 tool 渲染逻辑，支持折叠/展开状态切换
- [x] 5.2 running 状态：显示旋转 `Loader2` 图标 + 工具名称，不可折叠
- [x] 5.3 done 状态：默认折叠，显示工具名称 + summary 截断预览；展开后显示完整 summary
- [x] 5.4 error 状态：红色边框 + 错误信息，默认展开
- [x] 5.5 验证：对话中包含多个工具调用时，每个工具显示为独立的可折叠卡片，running 时有动画，完成后可展开查看详情
