import { nanoid } from 'nanoid';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { DbPool } from '../../core/db-pool';
import type { Config } from '../../config';
import { hashApiKey } from '../../core/auth';
import { ConflictError, NotFoundError } from '../../core/errors';

export interface App {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAppResult {
  app: App;
  apiKey: string; // plain text, shown only once
}

export class AppManager {
  constructor(
    private dbPool: DbPool,
    private config: Config,
  ) {}

  list(): App[] {
    const db = this.dbPool.getPlatformDb();
    return db.query('SELECT * FROM apps ORDER BY created_at DESC').all() as App[];
  }

  get(appId: string): App {
    const db = this.dbPool.getPlatformDb();
    const app = db.query('SELECT * FROM apps WHERE id = ?').get(appId) as App | null;
    if (!app) throw new NotFoundError(`App '${appId}' not found`);
    return app;
  }

  create(name: string, description = ''): CreateAppResult {
    const db = this.dbPool.getPlatformDb();

    // Check name uniqueness
    const existing = db.query('SELECT id FROM apps WHERE name = ?').get(name);
    if (existing) {
      throw new ConflictError(`App with name '${name}' already exists`);
    }

    const appId = nanoid(12);

    // Create app record
    db.query(
      'INSERT INTO apps (id, name, description) VALUES (?, ?, ?)',
    ).run(appId, name, description);

    // Create app data directories
    const appDir = join(this.config.dataDir, 'apps', appId);
    mkdirSync(join(appDir, 'storage'), { recursive: true });
    mkdirSync(join(appDir, 'functions'), { recursive: true });

    // Initialize the app database (creates the file)
    this.dbPool.getAppDb(appId);

    // Generate a default service API key
    const rawKey = `cb_${nanoid(32)}`;
    const keyId = nanoid(12);
    db.query(
      'INSERT INTO api_keys (id, app_id, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    ).run(keyId, appId, hashApiKey(rawKey), 'Default Service Key', 'service');

    const app = this.get(appId);
    return { app, apiKey: rawKey };
  }

  delete(appId: string): void {
    const app = this.get(appId); // throws if not found

    // Close database connection
    this.dbPool.closeAppDb(appId);

    // Remove app data directory
    const appDir = join(this.config.dataDir, 'apps', appId);
    if (existsSync(appDir)) {
      rmSync(appDir, { recursive: true, force: true });
    }

    // Remove platform records
    const db = this.dbPool.getPlatformDb();
    db.query('DELETE FROM api_keys WHERE app_id = ?').run(appId);
    db.query('DELETE FROM apps WHERE id = ?').run(appId);
  }

  update(appId: string, data: { name?: string; description?: string; status?: string }): App {
    const app = this.get(appId);
    const db = this.dbPool.getPlatformDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }

    if (fields.length === 0) return app;

    fields.push("updated_at = datetime('now')");
    values.push(appId);

    db.query(`UPDATE apps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.get(appId);
  }
}
