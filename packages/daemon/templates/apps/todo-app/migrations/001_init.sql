CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority IN (1, 2, 3)),
  completed INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

INSERT INTO tasks (id, title, description) VALUES
('1', '点我看详情', '可以用 **Markdown** 格式写任务描述。

这是一个功能基础的待办事项应用，可以手工操作，也可以通过右下角的聊天按钮让 Agent 进行操作。'),
('2', '修改应用', '可以通过点击左下角的 **进入构建器** 进入构建模式。

在构建模式中可以点击这个 TODO 应用对它进行修改，点击右下角的聊天按钮可以和 AI Agent 进行对话。

构建模式中的应用和正常使用的应用数据完全隔离，可以放心大胆地进行应用修改。'),
('3', '创建应用', '在构建模式中还可以通过 Agent 创建应用。

n点击 **创建新应用** 按钮可以和 Agent 描述你的想法，Agent 会自主决定如何创建。');