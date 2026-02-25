import { nanoid } from 'nanoid';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stringify as stringifyYAML } from 'yaml';
import type { Workspace } from '../../core/workspace';
import { hashApiKey } from '../../core/auth';
import { ConflictError, NotFoundError } from '../../core/errors';

export interface App {
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
    private workspace: Workspace,
  ) {}

  list(): App[] {
    const db = this.workspace.getPlatformDb();
    return db.query('SELECT * FROM apps ORDER BY created_at DESC').all() as App[];
  }

  get(name: string): App {
    const db = this.workspace.getPlatformDb();
    const app = db.query('SELECT * FROM apps WHERE name = ?').get(name) as App | null;
    if (!app) throw new NotFoundError(`App '${name}' not found`);
    return app;
  }

  create(name: string, description = ''): CreateAppResult {
    const db = this.workspace.getPlatformDb();

    // Check name uniqueness
    const existing = db.query('SELECT name FROM apps WHERE name = ?').get(name);
    if (existing) {
      throw new ConflictError(`App with name '${name}' already exists`);
    }

    // Create app directory + app.yaml + migrations/
    const appDir = join(this.workspace.appsDir, name);
    mkdirSync(join(appDir, 'migrations'), { recursive: true });
    writeFileSync(
      join(appDir, 'app.yaml'),
      stringifyYAML({ description }),
      'utf-8',
    );

    // Create platform DB record
    db.query(
      'INSERT INTO apps (name, description) VALUES (?, ?)',
    ).run(name, description);

    // Refresh app state cache
    this.workspace.refreshAppState(name);

    // Generate a default service API key
    const rawKey = `cb_${nanoid(32)}`;
    const keyId = nanoid(12);
    db.query(
      'INSERT INTO api_keys (id, app_name, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    ).run(keyId, name, hashApiKey(rawKey), 'Default Service Key', 'service');

    const app = this.get(name);
    return { app, apiKey: rawKey };
  }

  delete(name: string): void {
    this.get(name); // throws if not found

    // Remove from workspace caches (also closes DB connections)
    this.workspace.removeApp(name);

    // Remove app spec directory
    const appDir = join(this.workspace.appsDir, name);
    if (existsSync(appDir)) {
      rmSync(appDir, { recursive: true, force: true });
    }

    // Remove app data directory
    const appDataDir = join(this.workspace.dataDir, 'apps', name);
    if (existsSync(appDataDir)) {
      rmSync(appDataDir, { recursive: true, force: true });
    }

    // Remove draft data directory
    const draftDataDir = join(this.workspace.draftDir, 'apps', name);
    if (existsSync(draftDataDir)) {
      rmSync(draftDataDir, { recursive: true, force: true });
    }

    // Remove platform records
    const db = this.workspace.getPlatformDb();
    db.query('DELETE FROM api_keys WHERE app_name = ?').run(name);
    db.query('DELETE FROM apps WHERE name = ?').run(name);
  }

  update(name: string, data: { description?: string; status?: string }): App {
    const app = this.get(name);
    const db = this.workspace.getPlatformDb();

    const fields: string[] = [];
    const values: any[] = [];

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
    values.push(name);

    db.query(`UPDATE apps SET ${fields.join(', ')} WHERE name = ?`).run(...values);
    return this.get(name);
  }
}
