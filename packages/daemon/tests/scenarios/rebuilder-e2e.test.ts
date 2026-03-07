import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DraftRebuilder } from '../../src/core/draft-rebuilder';
import { Verifier } from '../../src/core/verifier';
import { Publisher } from '../../src/core/publisher';
import {
  createTestWorkspace,
  createTestApp,
  addMigration,
  addFunction,
  modifyMigration,
  deleteAppFile,
  readAppFile,
  setAppSpec,
  openDraftDb,
  openStableDb,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
  SEED_TODOS_SQL,
  SEED_TODOS_JSON,
  TEST_UI_PAGES_JSON,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

const DRAFT_ONLY_STATE = { stableStatus: null, hasDraft: true } as const;
const STABLE_RUNNING_STATE = { stableStatus: 'running', hasDraft: false } as const;
const STABLE_RUNNING_WITH_DRAFT_STATE = { stableStatus: 'running', hasDraft: true } as const;

describe('End-to-end Rebuilder Scenarios', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  // --- Scenario 9.1 ---
  describe('9.1: New App -> DraftRebuild -> query -> modify -> re-rebuild', () => {
    test('full draft development cycle', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + seed
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_seed.sql': SEED_TODOS_SQL },
      });

      // Step 2: Verify state is draft-only
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(DRAFT_ONLY_STATE);

      // Step 3: Draft rebuild
      const rebuilder = new DraftRebuilder(handle.workspace);
      const result1 = await rebuilder.rebuild('todos');
      expect(result1.success).toBe(true);

      // Step 4: Query draft DB — seed data present
      let db = openDraftDb(handle.root, 'todos');
      let rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe('Buy milk');
      expect(rows[1].title).toBe('Write tests');
      db.close();

      // Step 5: Add new migration
      addMigration(handle, 'todos', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      // Step 6: Re-rebuild
      const result2 = await rebuilder.rebuild('todos');
      expect(result2.success).toBe(true);
      expect(result2.migrations).toContain('001_init.sql');
      expect(result2.migrations).toContain('002_add_priority.sql');

      // Step 7: Draft DB rebuilt — new column exists, seed data re-loaded
      db = openDraftDb(handle.root, 'todos');
      const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('priority');

      rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
      expect(rows).toHaveLength(2); // Seed data re-loaded after rebuild
      db.close();
    });
  });

  // --- Scenario 9.2 ---
  describe('9.2: Draft only -> Publish -> verify stable state', () => {
    test('publish from draft creates full stable environment', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_seed.sql': SEED_TODOS_SQL },
      });
      handle.workspace.refreshAppState('todos');

      // Step 2: State is draft-only
      expect(handle.workspace.getAppState('todos')).toEqual(DRAFT_ONLY_STATE);

      // Step 3: Publish
      const publisher = new Publisher(handle.workspace);
      const result = await publisher.publish('todos');
      expect(result.success).toBe(true);

      // Step 4: Stable DB exists
      const stableDbPath = join(handle.root, 'stable', 'todos', 'db.sqlite');
      expect(existsSync(stableDbPath)).toBe(true);

      // Step 5: _migrations table has version 1
      const db = openStableDb(handle.root, 'todos');
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);

      // Step 6: Table structure exists in stable
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").all();
      expect(tables).toHaveLength(1);
      db.close();

      // Step 7: Migrations marked immutable
      const platformDb = handle.workspace.getPlatformDb();
      const migFile = platformDb.query(
        "SELECT immutable FROM app_files WHERE app_slug = 'todos' AND path LIKE 'migrations/001%'",
      ).get() as { immutable: number };
      expect(migFile.immutable).toBe(1);

      // Step 8: Draft DB removed
      const draftDbPath = join(handle.root, 'draft', 'todos', 'db.sqlite');
      expect(existsSync(draftDbPath)).toBe(false);

      // Step 9: State is running stable
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(STABLE_RUNNING_STATE);
    });
  });

  // --- Scenario 9.3 ---
  describe('9.3: Stable + new migration -> DraftRebuild -> Verify -> Publish', () => {
    test('incremental development after initial publish', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (establish stable)
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('todos');

      // Step 2: Add new migration
      addMigration(handle, 'todos', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      // Step 3: State has running stable plus draft changes
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(STABLE_RUNNING_WITH_DRAFT_STATE);

      // Step 4: Draft rebuild — draft DB has both migrations
      const rebuilder = new DraftRebuilder(handle.workspace);
      const rebuildResult = await rebuilder.rebuild('todos');
      expect(rebuildResult.success).toBe(true);
      expect(rebuildResult.migrations).toContain('002_add_priority.sql');

      // Step 5: Verify passes
      const verifier = new Verifier(handle.workspace);
      const verifyResult = verifier.verify('todos');
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.migrationsToApply).toEqual(['002_add_priority.sql']);

      // Step 6: Publish
      const publishResult = await publisher.publish('todos');
      expect(publishResult.success).toBe(true);
      expect(publishResult.migrationsApplied).toContain('002_add_priority.sql');

      // Step 7: Stable DB has both migrations + priority column
      const db = openStableDb(handle.root, 'todos');
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1, 2]);

      const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('priority');
      db.close();

      // Step 8: Backup exists
      const backupPath = join(handle.root, 'stable', 'todos', 'db.sqlite.bak');
      expect(existsSync(backupPath)).toBe(true);

      // Step 9: State is running stable
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(STABLE_RUNNING_STATE);
    });
  });

  // --- Scenario 9.4 ---
  describe('9.4: Modify published migration -> Verify -> immutability error', () => {
    test('published migration tampering detected', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (marks migrations immutable)
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('todos');

      // Step 2: Modify published migration (clears immutable flag in test helper)
      modifyMigration(handle, 'todos', '001_init.sql', 'CREATE TABLE changed (id INTEGER PRIMARY KEY);');

      // Step 3: State now has running stable plus draft changes
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(STABLE_RUNNING_WITH_DRAFT_STATE);

      // Step 4: Verify should fail with immutability error
      const verifier = new Verifier(handle.workspace);
      const result = verifier.verify('todos');
      expect(result.success).toBe(false);
      expect(result.error).toContain('immutable');
      expect(result.error).toContain('001_init.sql');
    });
  });

  // --- Scenario 9.5 ---
  describe('9.5: Draft-only app cannot be verified before first publish', () => {
    test('verify rejects an app without stable state', async () => {
      handle = createTestWorkspace();

      // Step 1: Create an unpublished app
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      // Step 2: State is draft-only
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(DRAFT_ONLY_STATE);

      // Step 3: Verify is rejected because there is no stable version yet
      const verifier = new Verifier(handle.workspace);
      expect(() => verifier.verify('todos')).toThrow(/no stable version/);
    });
  });

  // --- Scenario 9.6 ---
  describe('9.6: Publish with bad SQL -> backup restore', () => {
    test('failed publish restores stable database', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (establish stable)
      createTestApp(handle, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('todos');

      // Step 2: Insert canary row into stable DB
      const appCtx = handle.workspace.getOrCreateApp('todos')!;
      appCtx.stableDb.exec("INSERT INTO todos (id, title) VALUES (999, 'canary')");
      appCtx.closeStable();

      // Step 3: Add bad migration
      addMigration(handle, 'todos', '002_bad.sql', MIGRATION_BAD_SQL);

      // Step 4: State now has running stable plus draft changes
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toEqual(STABLE_RUNNING_WITH_DRAFT_STATE);

      // Step 5: Publish should fail
      const result = await publisher.publish('todos');
      expect(result.success).toBe(false);

      // Step 6: Canary row still present (stable DB restored from backup)
      const db = openStableDb(handle.root, 'todos');
      const canary = db.query('SELECT * FROM todos WHERE id = 999').get() as { title: string } | null;
      expect(canary).toBeDefined();
      expect(canary!.title).toBe('canary');

      // Step 7: _migrations still only has version 1
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);
      db.close();
    });
  });

  // --- Scenario 9.7: Init -> auto-publish -> stable accessible ---
  describe('9.7: Init auto-publishes template apps to stable', () => {
    test('after init + publish, template app is stable with DB and functions', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + function (simulating template)
      const fnCode = 'export async function GET(ctx) { return ctx.db.query("SELECT 1"); }';
      createTestApp(handle, 'welcome', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_seed.sql': SEED_TODOS_SQL },
        functions: { 'todos.ts': fnCode },
      });

      // Step 2: State is draft-only
      handle.workspace.refreshAppState('welcome');
      expect(handle.workspace.getAppState('welcome')).toEqual(DRAFT_ONLY_STATE);

      // Step 3: Auto-publish (simulating what server.ts does after init)
      const publisher = new Publisher(handle.workspace);
      const result = await publisher.publish('welcome');
      expect(result.success).toBe(true);

      // Step 4: Stable DB now exists
      const stableDbPath = join(handle.root, 'stable', 'welcome', 'db.sqlite');
      expect(existsSync(stableDbPath)).toBe(true);

      // Step 5: Stable functions directory exists with todos.ts
      const stableFnDir = join(handle.root, 'stable', 'welcome', 'functions');
      expect(existsSync(stableFnDir)).toBe(true);
      expect(existsSync(join(stableFnDir, 'todos.ts'))).toBe(true);

      // Step 6: State is now running stable
      handle.workspace.refreshAppState('welcome');
      expect(handle.workspace.getAppState('welcome')).toEqual(STABLE_RUNNING_STATE);
    });
  });

  // --- Scenario 9.8: Rebuild copies functions to draft dir ---
  describe('9.8: Draft Rebuild copies functions to draft directory', () => {
    test('rebuild copies function files to draft/apps/{name}/functions/', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + functions
      const fnCode = 'export async function GET(ctx) { return []; }';
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: { 'orders.ts': fnCode, 'users.ts': fnCode },
      });

      // Step 2: State is draft-only
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toEqual(DRAFT_ONLY_STATE);

      // Step 3: Before rebuild, draft functions dir does not exist
      const draftFnDir = join(handle.root, 'draft', 'myapp', 'functions');
      expect(existsSync(draftFnDir)).toBe(false);

      // Step 4: Rebuild
      const rebuilder = new DraftRebuilder(handle.workspace);
      const result = await rebuilder.rebuild('myapp');
      expect(result.success).toBe(true);

      // Step 5: Draft functions dir now exists with both files
      expect(existsSync(draftFnDir)).toBe(true);
      const files = readdirSync(draftFnDir).sort();
      expect(files).toEqual(['orders.ts', 'users.ts']);

      // Step 6: Content matches what was stored in DB
      const dbContent = readAppFile(handle, 'myapp', 'functions/orders.ts');
      const draftContent = readFileSync(join(draftFnDir, 'orders.ts'), 'utf-8');
      expect(draftContent).toBe(dbContent);
    });
  });

  // --- Scenario 9.9: Draft functions isolation — DB changes don't affect draft until rebuild ---
  describe('9.9: Draft functions require rebuild after source modification', () => {
    test('modifying source function does not update draft until rebuild', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with function
      const fnCodeV1 = 'export async function GET(ctx) { return { version: 1 }; }';
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: { 'handler.ts': fnCodeV1 },
      });

      // Step 2: First rebuild — exports v1 to draft
      handle.workspace.refreshAppState('myapp');
      const rebuilder = new DraftRebuilder(handle.workspace);
      const result1 = await rebuilder.rebuild('myapp');
      expect(result1.success).toBe(true);

      const draftFnPath = join(handle.root, 'draft', 'myapp', 'functions', 'handler.ts');
      expect(readFileSync(draftFnPath, 'utf-8')).toContain('version: 1');

      // Step 3: Modify function in DB (v2)
      const fnCodeV2 = 'export async function GET(ctx) { return { version: 2 }; }';
      addFunction(handle, 'myapp', 'handler.ts', fnCodeV2);

      // Step 4: Draft still has v1 (no rebuild yet)
      expect(readFileSync(draftFnPath, 'utf-8')).toContain('version: 1');

      // Step 5: DB has v2
      const dbContent = readAppFile(handle, 'myapp', 'functions/handler.ts');
      expect(dbContent).toContain('version: 2');

      // Step 6: Rebuild again — draft now has v2
      const result2 = await rebuilder.rebuild('myapp');
      expect(result2.success).toBe(true);
      expect(readFileSync(draftFnPath, 'utf-8')).toContain('version: 2');
    });
  });

  // --- Scenario 9.10: Deleted function cleaned on re-rebuild ---
  describe('9.10: Re-rebuild cleans up deleted function from draft directory', () => {
    test('removing a function from DB then rebuilding clears it from draft', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with two functions
      const fnCode = 'export async function GET(ctx) { return []; }';
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: { 'orders.ts': fnCode, 'users.ts': fnCode },
      });

      // Step 2: First rebuild — both exported to draft
      handle.workspace.refreshAppState('myapp');
      const rebuilder = new DraftRebuilder(handle.workspace);
      const result1 = await rebuilder.rebuild('myapp');
      expect(result1.success).toBe(true);

      const draftFnDir = join(handle.root, 'draft', 'myapp', 'functions');
      expect(readdirSync(draftFnDir).sort()).toEqual(['orders.ts', 'users.ts']);

      // Step 3: Delete orders.ts from app_files DB
      deleteAppFile(handle, 'myapp', 'functions/orders.ts');

      // Step 4: Re-rebuild — draft should only have users.ts
      const result2 = await rebuilder.rebuild('myapp');
      expect(result2.success).toBe(true);

      expect(readdirSync(draftFnDir).sort()).toEqual(['users.ts']);
      expect(existsSync(join(draftFnDir, 'orders.ts'))).toBe(false);
    });
  });

  // --- Scenario 9.11: Draft Rebuild exports UI definition ---
  describe('9.11: Draft Rebuild exports ui/pages.json to draft directory', () => {
    test('rebuild copies UI definition to draft/apps/{name}/ui/pages.json', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + UI
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });

      // Step 2: Rebuild
      handle.workspace.refreshAppState('myapp');
      const rebuilder = new DraftRebuilder(handle.workspace);
      const result = await rebuilder.rebuild('myapp');
      expect(result.success).toBe(true);
      expect(result.ui).toEqual({ exported: true });

      // Step 3: UI file exists in draft directory
      const draftUiPath = join(handle.root, 'draft', 'myapp', 'ui', 'pages.json');
      expect(existsSync(draftUiPath)).toBe(true);

      // Step 4: Content matches
      const content = readFileSync(draftUiPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(JSON.parse(TEST_UI_PAGES_JSON));
    });
  });

  // --- Scenario 9.12: Publish exports UI definition to stable ---
  describe('9.12: Publish exports ui/pages.json to stable directory', () => {
    test('publish copies UI definition to stable/myapp/ui/pages.json', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + UI
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });

      // Step 2: Publish
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      const result = await publisher.publish('myapp');
      expect(result.success).toBe(true);
      expect(result.ui).toEqual({ exported: true });

      // Step 3: UI file exists in stable directory
      const stableUiPath = join(handle.root, 'stable', 'myapp', 'ui', 'pages.json');
      expect(existsSync(stableUiPath)).toBe(true);

      // Step 4: Content matches
      const content = readFileSync(stableUiPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(JSON.parse(TEST_UI_PAGES_JSON));

      // Step 5: Draft UI cleaned up
      const draftUiPath = join(handle.root, 'draft', 'myapp', 'ui', 'pages.json');
      expect(existsSync(draftUiPath)).toBe(false);
    });
  });

  // --- Scenario 9.13: Rebuild/Publish without UI definition ---
  describe('9.13: No UI definition — Rebuild and Publish succeed without ui field', () => {
    test('rebuild and publish work fine without ui/pages.json', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app without UI
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      // Step 2: Rebuild — no ui field in result
      handle.workspace.refreshAppState('myapp');
      const rebuilder = new DraftRebuilder(handle.workspace);
      const rebuildResult = await rebuilder.rebuild('myapp');
      expect(rebuildResult.success).toBe(true);
      expect(rebuildResult.ui).toBeUndefined();

      // Step 3: Publish — no ui field in result
      const publisher = new Publisher(handle.workspace);
      const publishResult = await publisher.publish('myapp');
      expect(publishResult.success).toBe(true);
      expect(publishResult.ui).toBeUndefined();

      // Step 4: No UI files created
      const draftUiPath = join(handle.root, 'draft', 'myapp', 'ui', 'pages.json');
      const stableUiPath = join(handle.root, 'stable', 'myapp', 'ui', 'pages.json');
      expect(existsSync(draftUiPath)).toBe(false);
      expect(existsSync(stableUiPath)).toBe(false);
    });
  });

  // --- Scenario 9.14: GET /stable/apps/:appName/ui returns UI definition ---
  describe('9.14: Stable UI API returns correct JSON after publish', () => {
    test('GET /stable/apps/:appName/ui returns published UI definition', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app with UI and publish
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('myapp');

      // Step 2: Create server and make request
      const { createServer } = await import('../../src/server');
      const { app, registry, startup } = createServer({
        port: 0,
        host: '127.0.0.1',
        workspaceDir: handle.root,
        jwtSecret: 'test-secret',
      });
      await startup;

      const res = await app.request('/stable/apps/myapp/ui');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual(JSON.parse(TEST_UI_PAGES_JSON));

      registry.shutdownAll();
    });
  });

  // --- Scenario 9.15: GET /stable/apps/:appName/ui returns 404 when not published ---
  describe('9.15: Stable UI API returns 404 when UI not published', () => {
    test('GET /stable/apps/:appName/ui returns 404 when no UI file exists', async () => {
      handle = createTestWorkspace();

      // Step 1: Create app without UI and publish (so it has stable state)
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('myapp');

      // Step 2: Create server and make request
      const { createServer } = await import('../../src/server');
      const { app, registry, startup } = createServer({
        port: 0,
        host: '127.0.0.1',
        workspaceDir: handle.root,
        jwtSecret: 'test-secret',
      });
      await startup;

      const res = await app.request('/stable/apps/myapp/ui');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error.code).toBe('NOT_FOUND');

      registry.shutdownAll();
    });
  });
});
