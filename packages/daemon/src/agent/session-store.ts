/**
 * SessionStore — Persistence layer for AI Agent sessions.
 *
 * Stores SDK session IDs and chat message history in platform.sqlite.
 * Tables are created by Workspace.initPlatformSchema().
 */

import type { Database } from 'bun:sqlite';

export interface StoredMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolStatus?: string;
  toolSummary?: string;
  createdAt?: string;
}

export class SessionStore {
  constructor(private db: Database) {}

  // --- Session CRUD ---

  getSessionId(appSlug: string): string | null {
    const row = this.db.query(
      'SELECT sdk_session_id FROM agent_sessions WHERE app_slug = ?',
    ).get(appSlug) as { sdk_session_id: string | null } | null;
    return row?.sdk_session_id ?? null;
  }

  saveSessionId(appSlug: string, sdkSessionId: string): void {
    this.db.query(`
      INSERT INTO agent_sessions (app_slug, sdk_session_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(app_slug) DO UPDATE SET
        sdk_session_id = excluded.sdk_session_id,
        updated_at = datetime('now')
    `).run(appSlug, sdkSessionId);
  }

  /** Clear only the SDK session ID (keeps message history intact). */
  clearSessionId(appSlug: string): void {
    this.db.query(`
      UPDATE agent_sessions SET sdk_session_id = NULL, updated_at = datetime('now')
      WHERE app_slug = ?
    `).run(appSlug);
  }

  /** Delete the session row and all associated messages. */
  deleteSession(appSlug: string): void {
    this.db.query('DELETE FROM agent_sessions WHERE app_slug = ?').run(appSlug);
    this.db.query('DELETE FROM agent_messages WHERE app_slug = ?').run(appSlug);
  }

  // --- Message CRUD ---

  getMessages(appSlug: string, limit = 100): StoredMessage[] {
    const rows = this.db.query(`
      SELECT role, content, tool_name, tool_status, tool_summary, created_at
      FROM agent_messages
      WHERE app_slug = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(appSlug, limit) as {
      role: string;
      content: string;
      tool_name: string | null;
      tool_status: string | null;
      tool_summary: string | null;
      created_at: string;
    }[];

    // Reverse to get chronological order (we fetched newest-first for LIMIT)
    rows.reverse();

    return rows.map((row) => {
      const msg: StoredMessage = {
        role: row.role as StoredMessage['role'],
        content: row.content,
      };
      if (row.tool_name) msg.toolName = row.tool_name;
      if (row.tool_status) msg.toolStatus = row.tool_status;
      if (row.tool_summary) msg.toolSummary = row.tool_summary;
      if (row.created_at) msg.createdAt = row.created_at;
      return msg;
    });
  }

  addMessage(appSlug: string, msg: StoredMessage): void {
    this.db.query(`
      INSERT INTO agent_messages (app_slug, role, content, tool_name, tool_status, tool_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%d %H:%M:%f', 'now')))
    `).run(
      appSlug,
      msg.role,
      msg.content,
      msg.toolName ?? null,
      msg.toolStatus ?? null,
      msg.toolSummary ?? null,
      msg.createdAt ?? null,
    );
  }

  clearMessages(appSlug: string): void {
    this.db.query('DELETE FROM agent_messages WHERE app_slug = ?').run(appSlug);
  }
}
