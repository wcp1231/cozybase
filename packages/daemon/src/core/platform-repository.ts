import type { Database } from 'bun:sqlite';
import type { StableStatus } from './workspace';

/**
 * Data access layer for PlatformDB
 * Provides abstraction over raw SQL queries for better maintainability and testability
 */

// --- Types ---

export interface AppRecord {
  slug: string;
  display_name: string;
  description: string;
  stable_status: StableStatus | null;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
}

export interface AppFileRecord {
  app_slug: string;
  path: string;
  content: string;
  immutable: number;
  updated_at: string;
}

export interface ApiKeyRecord {
  id: string;
  app_slug: string;
  key_hash: string;
  name: string;
  role: string;
  expires_at: string | null;
  created_at: string;
}

export interface AgentSessionRecord {
  app_slug: string;
  sdk_session_id: string | null;
  provider_kind: string | null;
  updated_at: string;
}

export interface AgentMessageRecord {
  id: number;
  app_slug: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_status: string | null;
  tool_summary: string | null;
  created_at: string;
}

// --- Repository Classes ---

/**
 * Repository for apps table operations
 */
export class AppsRepository {
  constructor(private db: Database) {}

  findBySlug(slug: string): AppRecord | null {
    return this.db.query('SELECT * FROM apps WHERE slug = ?').get(slug) as AppRecord | null;
  }

  findAll(): AppRecord[] {
    return this.db.query('SELECT * FROM apps ORDER BY slug').all() as AppRecord[];
  }

  exists(slug: string): boolean {
    const result = this.db.query('SELECT 1 FROM apps WHERE slug = ?').get(slug);
    return result !== null;
  }

  create(params: {
    slug: string;
    displayName?: string;
    description?: string;
    stableStatus?: StableStatus | null;
    currentVersion?: number;
    publishedVersion?: number;
  }): void {
    this.db
      .query(
        `INSERT INTO apps (slug, display_name, description, stable_status, current_version, published_version)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.slug,
        params.displayName ?? '',
        params.description ?? '',
        params.stableStatus ?? null,
        params.currentVersion ?? 0,
        params.publishedVersion ?? 0,
      );
  }

  update(slug: string, params: Partial<Omit<AppRecord, 'slug' | 'created_at' | 'updated_at'>>): void {
    const updates: string[] = [];
    const values: any[] = [];

    if (params.display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(params.display_name);
    }
    if (params.description !== undefined) {
      updates.push('description = ?');
      values.push(params.description);
    }
    if (params.stable_status !== undefined) {
      updates.push('stable_status = ?');
      values.push(params.stable_status);
    }
    if (params.current_version !== undefined) {
      updates.push('current_version = ?');
      values.push(params.current_version);
    }
    if (params.published_version !== undefined) {
      updates.push('published_version = ?');
      values.push(params.published_version);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(slug);
      this.db.query(`UPDATE apps SET ${updates.join(', ')} WHERE slug = ?`).run(...values);
    }
  }

  incrementVersion(slug: string): void {
    this.db
      .query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE slug = ?")
      .run(slug);
  }

  publish(slug: string, stableStatus: StableStatus): void {
    this.db
      .query(
        "UPDATE apps SET published_version = current_version, stable_status = ?, updated_at = datetime('now') WHERE slug = ?",
      )
      .run(stableStatus, slug);
  }

  delete(slug: string): void {
    this.db.query('DELETE FROM apps WHERE slug = ?').run(slug);
  }

  getVersionInfo(slug: string): { current_version: number; published_version: number; stable_status: StableStatus | null } | null {
    return this.db
      .query('SELECT current_version, published_version, stable_status FROM apps WHERE slug = ?')
      .get(slug) as any;
  }
}

/**
 * Repository for app_files table operations
 */
export class AppFilesRepository {
  constructor(private db: Database) {}

  findByAppAndPath(appSlug: string, path: string): AppFileRecord | null {
    return this.db
      .query('SELECT * FROM app_files WHERE app_slug = ? AND path = ?')
      .get(appSlug, path) as AppFileRecord | null;
  }

  findByApp(appSlug: string): AppFileRecord[] {
    return this.db
      .query('SELECT * FROM app_files WHERE app_slug = ? ORDER BY path')
      .all(appSlug) as AppFileRecord[];
  }

  findByAppAndPattern(appSlug: string, pattern: string): AppFileRecord[] {
    return this.db
      .query('SELECT * FROM app_files WHERE app_slug = ? AND path LIKE ? ORDER BY path')
      .all(appSlug, pattern) as AppFileRecord[];
  }

  exists(appSlug: string, path: string): boolean {
    const result = this.db.query('SELECT 1 FROM app_files WHERE app_slug = ? AND path = ?').get(appSlug, path);
    return result !== null;
  }

  create(appSlug: string, path: string, content: string, immutable = 0): void {
    this.db
      .query('INSERT INTO app_files (app_slug, path, content, immutable) VALUES (?, ?, ?, ?)')
      .run(appSlug, path, content, immutable);
  }

  upsert(appSlug: string, path: string, content: string): void {
    this.db
      .query(
        `INSERT INTO app_files (app_slug, path, content) VALUES (?, ?, ?)
         ON CONFLICT(app_slug, path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
      )
      .run(appSlug, path, content);
  }

  update(appSlug: string, path: string, content: string): void {
    this.db
      .query("UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_slug = ? AND path = ?")
      .run(content, appSlug, path);
  }

  delete(appSlug: string, path: string): void {
    this.db.query('DELETE FROM app_files WHERE app_slug = ? AND path = ?').run(appSlug, path);
  }

  deleteByApp(appSlug: string): void {
    this.db.query('DELETE FROM app_files WHERE app_slug = ?').run(appSlug);
  }

  markImmutable(appSlug: string, pathPattern: string): void {
    this.db.query('UPDATE app_files SET immutable = 1 WHERE app_slug = ? AND path LIKE ?').run(appSlug, pathPattern);
  }

  isImmutable(appSlug: string, path: string): boolean {
    const result = this.db
      .query('SELECT immutable FROM app_files WHERE app_slug = ? AND path = ?')
      .get(appSlug, path) as { immutable: number } | null;
    return result?.immutable === 1;
  }
}

/**
 * Repository for api_keys table operations
 */
export class ApiKeysRepository {
  constructor(private db: Database) {}

  findByKeyHash(keyHash: string): Pick<ApiKeyRecord, 'app_slug' | 'role' | 'expires_at'> | null {
    return this.db
      .query('SELECT app_slug, role, expires_at FROM api_keys WHERE key_hash = ?')
      .get(keyHash) as any;
  }

  findByApp(appSlug: string): ApiKeyRecord[] {
    return this.db.query('SELECT * FROM api_keys WHERE app_slug = ?').all(appSlug) as ApiKeyRecord[];
  }

  create(params: {
    id: string;
    appSlug: string;
    keyHash: string;
    name?: string;
    role?: string;
    expiresAt?: string | null;
  }): void {
    this.db
      .query(
        `INSERT INTO api_keys (id, app_slug, key_hash, name, role, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.id,
        params.appSlug,
        params.keyHash,
        params.name ?? '',
        params.role ?? 'service',
        params.expiresAt ?? null,
      );
  }

  delete(id: string): void {
    this.db.query('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  deleteByApp(appSlug: string): void {
    this.db.query('DELETE FROM api_keys WHERE app_slug = ?').run(appSlug);
  }
}

/**
 * Repository for agent_sessions table operations
 */
export class AgentSessionsRepository {
  constructor(private db: Database) {}

  findByApp(appSlug: string): AgentSessionRecord | null {
    return this.db
      .query('SELECT * FROM agent_sessions WHERE app_slug = ?')
      .get(appSlug) as AgentSessionRecord | null;
  }

  upsert(appSlug: string, sdkSessionId: string | null, providerKind: string | null = null): void {
    this.db
      .query(
        `INSERT INTO agent_sessions (app_slug, sdk_session_id, provider_kind) VALUES (?, ?, ?)
         ON CONFLICT(app_slug) DO UPDATE SET
           sdk_session_id = excluded.sdk_session_id,
           provider_kind = excluded.provider_kind,
           updated_at = datetime('now')`,
      )
      .run(appSlug, sdkSessionId, providerKind);
  }

  delete(appSlug: string): void {
    this.db.query('DELETE FROM agent_sessions WHERE app_slug = ?').run(appSlug);
  }
}

/**
 * Repository for agent_messages table operations
 */
export class AgentMessagesRepository {
  constructor(private db: Database) {}

  findByApp(appSlug: string, limit?: number): AgentMessageRecord[] {
    const query = limit
      ? 'SELECT * FROM agent_messages WHERE app_slug = ? ORDER BY id LIMIT ?'
      : 'SELECT * FROM agent_messages WHERE app_slug = ? ORDER BY id';

    return limit
      ? (this.db.query(query).all(appSlug, limit) as AgentMessageRecord[])
      : (this.db.query(query).all(appSlug) as AgentMessageRecord[]);
  }

  create(params: {
    appSlug: string;
    role: string;
    content?: string;
    toolName?: string | null;
    toolStatus?: string | null;
    toolSummary?: string | null;
  }): number {
    const result = this.db
      .query(
        `INSERT INTO agent_messages (app_slug, role, content, tool_name, tool_status, tool_summary)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.appSlug,
        params.role,
        params.content ?? '',
        params.toolName ?? null,
        params.toolStatus ?? null,
        params.toolSummary ?? null,
      );
    return result.lastInsertRowid as number;
  }

  deleteByApp(appSlug: string): void {
    this.db.query('DELETE FROM agent_messages WHERE app_slug = ?').run(appSlug);
  }
}

/**
 * Facade providing access to all repositories
 */
export class PlatformRepository {
  public readonly apps: AppsRepository;
  public readonly appFiles: AppFilesRepository;
  public readonly apiKeys: ApiKeysRepository;
  public readonly agentSessions: AgentSessionsRepository;
  public readonly agentMessages: AgentMessagesRepository;

  constructor(private db: Database) {
    this.apps = new AppsRepository(db);
    this.appFiles = new AppFilesRepository(db);
    this.apiKeys = new ApiKeysRepository(db);
    this.agentSessions = new AgentSessionsRepository(db);
    this.agentMessages = new AgentMessagesRepository(db);
  }

  /**
   * Execute a function within a transaction
   */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Get the underlying database connection
   * Use sparingly - prefer using repository methods
   */
  getDatabase(): Database {
    return this.db;
  }
}
