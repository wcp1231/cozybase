import type { Database } from 'bun:sqlite';
import type { DbPool } from './db-pool';
import type { AppDefinition, TableSpec, ColumnSpec, IndexSpec } from './workspace';
import { hashContent, scanWorkspace } from './workspace';
import type { Config } from '../config';

// --- Change tracking ---

export interface ReconcileChange {
  app: string;
  type: 'create_app' | 'create_table' | 'alter_table' | 'orphan_table' | 'create_index' | 'drop_index';
  resource: string;
  detail?: string;
  warning?: boolean;
}

// --- Reconciler ---

export class Reconciler {
  constructor(
    private dbPool: DbPool,
    private config: Config,
  ) {}

  /** Full reconcile: scan workspace and sync all apps */
  reconcileAll(): ReconcileChange[] {
    const apps = scanWorkspace(this.config.workspaceDir);
    const changes: ReconcileChange[] = [];

    // Ensure all discovered apps exist in platform DB
    const platformDb = this.dbPool.getPlatformDb();
    const knownApps = new Set(
      (platformDb.query('SELECT name FROM apps').all() as { name: string }[]).map((a) => a.name),
    );

    for (const app of apps) {
      if (!knownApps.has(app.name)) {
        platformDb.query(
          "INSERT INTO apps (name, description) VALUES (?, ?)",
        ).run(app.name, app.spec.description ?? '');
        changes.push({ app: app.name, type: 'create_app', resource: app.name });
      }

      const appChanges = this.reconcileApp(app);
      changes.push(...appChanges);
    }

    // Detect orphaned apps (in DB but not in workspace)
    for (const name of knownApps) {
      if (!apps.find((a) => a.name === name)) {
        console.warn(`  [${name}] App removed from workspace (data preserved)`);
      }
    }

    return changes;
  }

  /** Reconcile a single app */
  reconcileApp(app: AppDefinition): ReconcileChange[] {
    const changes: ReconcileChange[] = [];
    const db = this.dbPool.getAppDb(app.name);
    const platformDb = this.dbPool.getPlatformDb();

    // --- Reconcile Tables ---
    for (const [tableName, { spec, content }] of app.tables) {
      const hash = hashContent(content);

      // Check if spec has changed
      const stored = platformDb.query(
        'SELECT spec_hash FROM resource_state WHERE app_name = ? AND resource_type = ? AND resource_name = ?',
      ).get(app.name, 'table', tableName) as { spec_hash: string } | null;

      if (stored?.spec_hash === hash) {
        continue; // No change
      }

      // Introspect current table state
      const currentColumns = db.query(`PRAGMA table_info("${tableName}")`).all() as PragmaColumn[];

      if (currentColumns.length === 0) {
        // Table doesn't exist → CREATE
        this.createTable(db, tableName, spec);
        changes.push({
          app: app.name,
          type: 'create_table',
          resource: tableName,
          detail: `${spec.columns.length} columns`,
        });
      } else {
        // Table exists → diff and migrate
        const tableChanges = this.diffAndMigrateTable(db, app.name, tableName, spec, currentColumns);
        changes.push(...tableChanges);
      }

      // Reconcile indexes
      const indexChanges = this.reconcileIndexes(db, app.name, tableName, spec.indexes ?? []);
      changes.push(...indexChanges);

      // Update state hash
      platformDb.query(`
        INSERT OR REPLACE INTO resource_state (app_name, resource_type, resource_name, spec_hash, applied_at)
        VALUES (?, 'table', ?, ?, datetime('now'))
      `).run(app.name, tableName, hash);
    }

    // Detect orphaned tables
    const knownTables = (platformDb.query(
      "SELECT resource_name FROM resource_state WHERE app_name = ? AND resource_type = 'table'",
    ).all(app.name) as { resource_name: string }[]).map((r) => r.resource_name);

    const currentTableNames = [...app.tables.keys()];
    for (const table of knownTables) {
      if (!currentTableNames.includes(table)) {
        changes.push({
          app: app.name,
          type: 'orphan_table',
          resource: table,
          detail: 'Removed from workspace, data preserved',
          warning: true,
        });
      }
    }

    // --- Track functions (no deployment needed, loaded on-demand) ---
    for (const funcName of app.functions) {
      const funcPath = `${app.dir}/functions/${funcName}.ts`;
      const content = require('fs').readFileSync(funcPath, 'utf-8');
      const hash = hashContent(content);
      platformDb.query(`
        INSERT OR REPLACE INTO resource_state (app_name, resource_type, resource_name, spec_hash, applied_at)
        VALUES (?, 'function', ?, ?, datetime('now'))
      `).run(app.name, funcName, hash);
    }

    return changes;
  }

  private createTable(db: Database, tableName: string, spec: TableSpec): void {
    const columnDefs = spec.columns.map((col) => {
      const parts = [`"${col.name}"`, col.type.toUpperCase()];
      if (col.primary_key) parts.push('PRIMARY KEY');
      if (col.required) parts.push('NOT NULL');
      if (col.unique) parts.push('UNIQUE');
      if (col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
      if (col.references) parts.push(`REFERENCES ${col.references}`);
      return parts.join(' ');
    });

    const sql = `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
    db.exec(sql);

    // Create indexes
    if (spec.indexes) {
      for (const idx of spec.indexes) {
        const idxName = idx.name ?? `idx_${tableName}_${idx.columns.join('_')}`;
        const unique = idx.unique ? 'UNIQUE ' : '';
        const cols = idx.columns.map((c) => `"${c}"`).join(', ');
        db.exec(`CREATE ${unique}INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" (${cols})`);
      }
    }
  }

  private diffAndMigrateTable(
    db: Database,
    appName: string,
    tableName: string,
    spec: TableSpec,
    currentColumns: PragmaColumn[],
  ): ReconcileChange[] {
    const changes: ReconcileChange[] = [];
    const currentNames = new Set(currentColumns.map((c) => c.name));
    const specNames = new Set(spec.columns.map((c) => c.name));

    // New columns → ALTER TABLE ADD COLUMN
    for (const col of spec.columns) {
      if (!currentNames.has(col.name)) {
        const parts = [`"${col.name}"`, col.type.toUpperCase()];
        if (col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
        // NOT NULL without default can't be added to existing table
        if (col.required && col.default !== undefined) parts.push('NOT NULL');

        const sql = `ALTER TABLE "${tableName}" ADD COLUMN ${parts.join(' ')}`;
        db.exec(sql);
        changes.push({
          app: appName,
          type: 'alter_table',
          resource: tableName,
          detail: `+column: ${col.name}`,
        });
      }
    }

    // Removed columns → warn only
    for (const current of currentColumns) {
      if (!specNames.has(current.name)) {
        changes.push({
          app: appName,
          type: 'alter_table',
          resource: tableName,
          detail: `Column "${current.name}" removed from spec (data preserved)`,
          warning: true,
        });
      }
    }

    return changes;
  }

  private reconcileIndexes(
    db: Database,
    appName: string,
    tableName: string,
    specIndexes: IndexSpec[],
  ): ReconcileChange[] {
    const changes: ReconcileChange[] = [];

    // Get current indexes
    const currentIndexes = db.query(`PRAGMA index_list("${tableName}")`).all() as PragmaIndex[];
    const currentNonAuto = currentIndexes.filter((i) => !i.name.startsWith('sqlite_autoindex_'));

    // Build desired index map
    const desired = new Map<string, IndexSpec>();
    for (const idx of specIndexes) {
      const name = idx.name ?? `idx_${tableName}_${idx.columns.join('_')}`;
      desired.set(name, idx);
    }

    // Create missing indexes
    for (const [name, idx] of desired) {
      if (!currentNonAuto.find((i) => i.name === name)) {
        const unique = idx.unique ? 'UNIQUE ' : '';
        const cols = idx.columns.map((c) => `"${c}"`).join(', ');
        db.exec(`CREATE ${unique}INDEX IF NOT EXISTS "${name}" ON "${tableName}" (${cols})`);
        changes.push({ app: appName, type: 'create_index', resource: `${tableName}.${name}` });
      }
    }

    // Drop orphaned indexes
    for (const idx of currentNonAuto) {
      if (!desired.has(idx.name)) {
        db.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
        changes.push({ app: appName, type: 'drop_index', resource: `${tableName}.${idx.name}` });
      }
    }

    return changes;
  }
}

// --- SQLite PRAGMA types ---

interface PragmaColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface PragmaIndex {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}
