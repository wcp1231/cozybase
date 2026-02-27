import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { stringify as stringifyYAML } from 'yaml';
import { Workspace } from '../../src/core/workspace';

// ---- Types ----

export interface TestAppSpec {
  migrations?: Record<string, string>;
  seeds?: Record<string, string>;
  functions?: Record<string, string>;
  ui?: string;  // ui/pages.json content
  spec?: Record<string, unknown>;
}

export interface TestWorkspaceHandle {
  root: string;
  workspace: Workspace;
  cleanup: () => void;
}

// ---- Primary factory ----

export function createTestWorkspace(): TestWorkspaceHandle {
  const root = mkdtempSync(join(tmpdir(), 'cozybase-test-'));

  mkdirSync(join(root, 'stable'), { recursive: true });
  mkdirSync(join(root, 'draft'), { recursive: true });

  writeFileSync(
    join(root, 'workspace.yaml'),
    stringifyYAML({ name: 'cozybase', version: 1 }),
    'utf-8',
  );

  const workspace = new Workspace(root);
  workspace.load();

  return {
    root,
    workspace,
    cleanup: () => {
      workspace.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// ---- App creation (DB-backed) ----

export function createTestApp(
  handle: TestWorkspaceHandle,
  appName: string,
  opts: TestAppSpec = {},
): void {
  const db = handle.workspace.getPlatformDb();

  const spec = opts.spec ?? { description: `Test app: ${appName}` };
  const description = typeof spec.description === 'string' ? spec.description : '';
  const status = typeof spec.status === 'string' ? spec.status : 'active';

  // Create app record
  db.query(
    'INSERT INTO apps (name, description, status, current_version, published_version) VALUES (?, ?, ?, 1, 0)',
  ).run(appName, description, status);

  // Insert app.yaml
  db.query(
    'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
  ).run(appName, 'app.yaml', stringifyYAML(spec));

  // Insert migrations
  if (opts.migrations) {
    for (const [filename, sql] of Object.entries(opts.migrations)) {
      db.query(
        'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
      ).run(appName, `migrations/${filename}`, sql);
    }
  }

  // Insert seeds
  if (opts.seeds) {
    for (const [filename, content] of Object.entries(opts.seeds)) {
      db.query(
        'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
      ).run(appName, `seeds/${filename}`, content);
    }
  }

  // Insert functions
  if (opts.functions) {
    for (const [filename, code] of Object.entries(opts.functions)) {
      db.query(
        'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
      ).run(appName, `functions/${filename}`, code);
    }
  }

  // Insert UI definition
  if (opts.ui) {
    db.query(
      'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
    ).run(appName, 'ui/pages.json', opts.ui);
  }
}

// ---- File mutation helpers (DB-backed) ----

export function addMigration(handle: TestWorkspaceHandle, appName: string, filename: string, sql: string): void {
  const db = handle.workspace.getPlatformDb();
  db.query(`
    INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)
    ON CONFLICT(app_name, path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `).run(appName, `migrations/${filename}`, sql);

  // Increment current_version
  db.query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?").run(appName);
}

export function addFunction(handle: TestWorkspaceHandle, appName: string, filename: string, code: string): void {
  const db = handle.workspace.getPlatformDb();
  db.query(`
    INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)
    ON CONFLICT(app_name, path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `).run(appName, `functions/${filename}`, code);

  // Increment current_version
  db.query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?").run(appName);
}

export function deleteAppFile(handle: TestWorkspaceHandle, appName: string, path: string): void {
  const db = handle.workspace.getPlatformDb();
  db.query('DELETE FROM app_files WHERE app_name = ? AND path = ?').run(appName, path);

  // Increment current_version
  db.query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?").run(appName);
}

export function modifyMigration(handle: TestWorkspaceHandle, appName: string, filename: string, newSql: string): void {
  const db = handle.workspace.getPlatformDb();

  // Check if immutable - force-clear immutable flag to simulate modification of published migration
  const record = db.query(
    'SELECT immutable FROM app_files WHERE app_name = ? AND path = ?',
  ).get(appName, `migrations/${filename}`) as { immutable: number } | null;

  if (record && record.immutable === 1) {
    // Clear immutable flag and update content (simulates someone tampering with a published migration)
    db.query(
      "UPDATE app_files SET immutable = 0, content = ?, updated_at = datetime('now') WHERE app_name = ? AND path = ?",
    ).run(newSql, appName, `migrations/${filename}`);
  } else {
    db.query(
      "UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_name = ? AND path = ?",
    ).run(newSql, appName, `migrations/${filename}`);
  }

  // Increment current_version
  db.query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?").run(appName);
}

export function setAppSpec(handle: TestWorkspaceHandle, appName: string, spec: Record<string, unknown>): void {
  const db = handle.workspace.getPlatformDb();
  const content = stringifyYAML(spec);

  db.query(
    "UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_name = ? AND path = 'app.yaml'",
  ).run(content, appName);

  // Also update description and status in apps table if provided
  if (spec.description !== undefined) {
    db.query('UPDATE apps SET description = ? WHERE name = ?').run(String(spec.description), appName);
  }
  if (spec.status !== undefined) {
    db.query('UPDATE apps SET status = ? WHERE name = ?').run(String(spec.status), appName);
  }

  // Increment current_version
  db.query("UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?").run(appName);
}

/** Read a file's content from app_files DB */
export function readAppFile(handle: TestWorkspaceHandle, appName: string, path: string): string | null {
  const db = handle.workspace.getPlatformDb();
  const record = db.query(
    'SELECT content FROM app_files WHERE app_name = ? AND path = ?',
  ).get(appName, path) as { content: string } | null;
  return record?.content ?? null;
}

// ---- Database helpers ----

export function openDraftDb(root: string, appName: string): Database {
  return new Database(join(root, 'draft', appName, 'db.sqlite'));
}

export function openStableDb(root: string, appName: string): Database {
  return new Database(join(root, 'stable', appName, 'db.sqlite'));
}

/** Create a stable DB with migrations already applied (simulating a prior publish).
 *  Also marks migrations as immutable and sets published_version in platform DB. */
export function createStableDb(handle: TestWorkspaceHandle, appName: string, migrationSqls: string[], versions: number[]): void {
  const root = handle.root;
  const stableDir = join(root, 'stable', appName);
  mkdirSync(stableDir, { recursive: true });
  const db = new Database(join(stableDir, 'db.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Execute migrations
  for (const sql of migrationSqls) {
    db.exec(sql);
  }

  // Create and populate _migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  for (const v of versions) {
    db.query('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(v, `${String(v).padStart(3, '0')}_migration`);
  }

  db.close();

  // Mark migrations as immutable and update published_version in platform DB
  const platformDb = handle.workspace.getPlatformDb();
  for (const v of versions) {
    const versionPrefix = String(v).padStart(3, '0');
    platformDb.query('UPDATE app_files SET immutable = 1 WHERE app_name = ? AND path LIKE ?')
      .run(appName, `migrations/${versionPrefix}_%`);
  }
  platformDb.query('UPDATE apps SET published_version = current_version WHERE name = ?').run(appName);
}

// ---- Standard test fixtures ----

export const MIGRATION_CREATE_TODOS = `
CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

export const MIGRATION_ADD_PRIORITY = `
ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;
`;

export const MIGRATION_BAD_SQL = `
ALTER TABLE nonexistent_table ADD COLUMN foo TEXT;
`;

export const SEED_TODOS_SQL = `
INSERT INTO todos (id, title, done) VALUES (1, 'Buy milk', 0);
INSERT INTO todos (id, title, done) VALUES (2, 'Write tests', 0);
`;

export const SEED_TODOS_JSON = JSON.stringify({
  table: 'todos',
  rows: [
    { id: 10, title: 'JSON seed item', done: 0 },
    { id: 11, title: 'Another JSON item', done: 1 },
  ],
});

export { existsSync } from 'fs';

export const TEST_UI_PAGES_JSON = JSON.stringify({
  pages: [
    {
      id: 'todo-list',
      title: 'Todo List',
      body: [{ type: 'text', content: 'Hello World' }],
    },
  ],
});
