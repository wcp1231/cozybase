import type { Database } from 'bun:sqlite';
import { projectHistoryFromSnapshot, type ProviderSessionSnapshot, type StoredMessage } from '@cozybase/ai-runtime';

export type RuntimeSessionUsageType = 'builder' | 'operator' | 'cozybase';

export interface StoredRuntimeSession {
  providerKind: string;
  snapshot: ProviderSessionSnapshot;
}

export class RuntimeSessionStore {
  constructor(private db: Database) {}

  getSession(usageType: RuntimeSessionUsageType, appSlug: string): StoredRuntimeSession | null {
    const row = this.db.query(
      `SELECT provider_kind, snapshot_json
       FROM agent_runtime_sessions
       WHERE usage_type = ? AND app_slug = ?`,
    ).get(usageType, appSlug) as {
      provider_kind: string;
      snapshot_json: string;
    } | null;

    if (!row) {
      return null;
    }

    try {
      return {
        providerKind: row.provider_kind,
        snapshot: JSON.parse(row.snapshot_json) as ProviderSessionSnapshot,
      };
    } catch {
      return null;
    }
  }

  getProjectedHistory(usageType: RuntimeSessionUsageType, appSlug: string): StoredMessage[] {
    const session = this.getSession(usageType, appSlug);
    if (!session) {
      return [];
    }
    return projectHistoryFromSnapshot(session.snapshot);
  }

  saveSession(
    usageType: RuntimeSessionUsageType,
    appSlug: string,
    providerKind: string,
    snapshot: ProviderSessionSnapshot,
  ): void {
    this.db.query(`
      INSERT INTO agent_runtime_sessions (usage_type, app_slug, provider_kind, snapshot_json, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(usage_type, app_slug) DO UPDATE SET
        provider_kind = excluded.provider_kind,
        snapshot_json = excluded.snapshot_json,
        updated_at = datetime('now')
    `).run(usageType, appSlug, providerKind, JSON.stringify(snapshot));
  }

  clearSession(usageType: RuntimeSessionUsageType, appSlug: string): void {
    this.db.query(
      'DELETE FROM agent_runtime_sessions WHERE usage_type = ? AND app_slug = ?',
    ).run(usageType, appSlug);
  }
}
