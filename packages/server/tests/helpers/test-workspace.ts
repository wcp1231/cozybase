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

  mkdirSync(join(root, 'apps'), { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'draft'), { recursive: true });

  writeFileSync(
    join(root, 'workspace.yaml'),
    stringifyYAML({ name: 'cozybase', version: 1 }),
    'utf-8',
  );

  writeFileSync(
    join(root, '.gitignore'),
    ['data/', 'draft/', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', ''].join('\n'),
    'utf-8',
  );

  // Init git repo with user config for commits
  gitExec(root, ['init']);
  gitExec(root, ['config', 'user.email', 'test@test.com']);
  gitExec(root, ['config', 'user.name', 'Test']);
  gitExec(root, ['add', '.']);
  gitExec(root, ['commit', '-m', 'init workspace']);

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

// ---- App creation ----

export function createTestApp(
  root: string,
  appName: string,
  opts: TestAppSpec = {},
): void {
  const appDir = join(root, 'apps', appName);
  mkdirSync(appDir, { recursive: true });

  const spec = opts.spec ?? { description: `Test app: ${appName}` };
  writeFileSync(join(appDir, 'app.yaml'), stringifyYAML(spec), 'utf-8');

  if (opts.migrations) {
    const migrationsDir = join(appDir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });
    for (const [filename, sql] of Object.entries(opts.migrations)) {
      writeFileSync(join(migrationsDir, filename), sql, 'utf-8');
    }
  }

  if (opts.seeds) {
    const seedsDir = join(appDir, 'seeds');
    mkdirSync(seedsDir, { recursive: true });
    for (const [filename, content] of Object.entries(opts.seeds)) {
      writeFileSync(join(seedsDir, filename), content, 'utf-8');
    }
  }
}

// ---- Git helpers ----

export function gitExec(root: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
  return result.stdout.toString();
}

export function commitAll(root: string, message = 'test commit'): void {
  gitExec(root, ['add', '-A']);
  gitExec(root, ['commit', '-m', message]);
}

export function commitApp(root: string, appName: string, message?: string): void {
  gitExec(root, ['add', `apps/${appName}/`]);
  gitExec(root, ['commit', '-m', message ?? `commit ${appName}`]);
}

// ---- File mutation helpers ----

export function addMigration(root: string, appName: string, filename: string, sql: string): void {
  const migrationsDir = join(root, 'apps', appName, 'migrations');
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(join(migrationsDir, filename), sql, 'utf-8');
}

export function modifyMigration(root: string, appName: string, filename: string, newSql: string): void {
  writeFileSync(join(root, 'apps', appName, 'migrations', filename), newSql, 'utf-8');
}

export function setAppSpec(root: string, appName: string, spec: Record<string, unknown>): void {
  writeFileSync(
    join(root, 'apps', appName, 'app.yaml'),
    stringifyYAML(spec),
    'utf-8',
  );
}

// ---- Database helpers ----

export function openDraftDb(root: string, appName: string): Database {
  return new Database(join(root, 'draft', 'apps', appName, 'db.sqlite'));
}

export function openStableDb(root: string, appName: string): Database {
  return new Database(join(root, 'data', 'apps', appName, 'db.sqlite'));
}

/** Create a stable DB with migrations already applied (simulating a prior publish) */
export function createStableDb(root: string, appName: string, migrationSqls: string[], versions: number[]): void {
  const stableDir = join(root, 'data', 'apps', appName);
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
