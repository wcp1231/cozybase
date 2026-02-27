CREATE TABLE IF NOT EXISTS todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO todo (title, completed) VALUES ('学习 cozybase 平台基础功能', 1);
INSERT INTO todo (title, completed) VALUES ('创建第一个 Migration', 1);
INSERT INTO todo (title, completed) VALUES ('编写 Function 处理 API 请求', 0);
INSERT INTO todo (title, completed) VALUES ('尝试使用 Auto CRUD API 查询数据', 0);
