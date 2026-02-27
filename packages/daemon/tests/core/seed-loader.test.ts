import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { SeedLoader } from '../../src/core/seed-loader';
import { MIGRATION_CREATE_TODOS, SEED_TODOS_SQL, SEED_TODOS_JSON } from '../helpers/test-workspace';

describe('SeedLoader', () => {
  let loader: SeedLoader;
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    loader = new SeedLoader();
    tempDir = mkdtempSync(join(tmpdir(), 'sl-test-'));
    db = new Database(':memory:');
    db.exec(MIGRATION_CREATE_TODOS);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('loads .sql seed file and inserts data', () => {
    writeFileSync(join(tempDir, '01_seed.sql'), SEED_TODOS_SQL);

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(['01_seed.sql']);

    const rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Buy milk');
    expect(rows[1].title).toBe('Write tests');
  });

  test('loads .json seed file and inserts rows', () => {
    writeFileSync(join(tempDir, '01_seed.json'), SEED_TODOS_JSON);

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(['01_seed.json']);

    const rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(10);
    expect(rows[0].title).toBe('JSON seed item');
  });

  test('processes files in sorted order', () => {
    writeFileSync(join(tempDir, '02_more.sql'), "INSERT INTO todos (id, title) VALUES (3, 'Third');");
    writeFileSync(join(tempDir, '01_first.sql'), "INSERT INTO todos (id, title) VALUES (1, 'First');");

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(['01_first.sql', '02_more.sql']);
  });

  test('returns success with empty array for non-existent directory', () => {
    const result = loader.loadSeeds(db, '/nonexistent/path');
    expect(result.success).toBe(true);
    expect(result.loaded).toEqual([]);
  });

  test('returns error on invalid JSON schema', () => {
    writeFileSync(join(tempDir, 'bad.json'), JSON.stringify({ wrong: 'shape' }));

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(false);
    expect(result.failedSeed).toBe('bad.json');
    expect(result.error).toBeDefined();
  });

  test('returns error on SQL execution failure', () => {
    writeFileSync(join(tempDir, 'bad.sql'), "INSERT INTO nonexistent (id) VALUES (1);");

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(false);
    expect(result.failedSeed).toBe('bad.sql');
  });

  test('skips non-.sql/.json files silently', () => {
    writeFileSync(join(tempDir, 'readme.txt'), 'not a seed');
    writeFileSync(join(tempDir, 'seed.sql'), SEED_TODOS_SQL);

    const result = loader.loadSeeds(db, tempDir);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(['seed.sql']);
  });
});
