import { join } from 'path';
import { existsSync, copyFileSync, unlinkSync, rmSync } from 'fs';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { exportFunctionsFromDb, exportUiFromDb } from './file-export';
import { BadRequestError } from './errors';

// --- Types ---

export interface PublishResult {
  success: boolean;
  migrationsApplied: string[];  // filenames of applied migrations
  ui?: { exported: boolean };
  error?: string;
}

// --- Publisher ---

export class Publisher {
  private migrationRunner = new MigrationRunner();

  constructor(private workspace: Workspace) {}

  /** Publish draft changes to stable */
  publish(appName: string): PublishResult {
    // Validate app state
    const state = this.workspace.getAppState(appName);
    if (!state) {
      throw new BadRequestError(`App '${appName}' not found`);
    }
    if (state === 'deleted') {
      throw new BadRequestError(`App '${appName}' is deleted`);
    }
    if (state === 'stable') {
      throw new BadRequestError(`App '${appName}' has no draft changes to publish`);
    }

    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new BadRequestError(`App '${appName}' not found`);
    }

    const isNewApp = state === 'draft_only';
    const backupPath = appContext.stableDbPath + '.bak';

    // 1. Backup stable database (skip for new apps)
    if (!isNewApp && existsSync(appContext.stableDbPath)) {
      // WAL checkpoint before backup
      appContext.stableDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      appContext.closeStable();
      copyFileSync(appContext.stableDbPath, backupPath);
    }

    const platformDb = this.workspace.getPlatformDb();

    try {
      // 2. Query migrations from app_files
      const migrationRecords = platformDb.query(
        "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'migrations/%' ORDER BY path",
      ).all(appName) as { path: string; content: string }[];

      const allMigrations = MigrationRunner.fromDbRecords(migrationRecords);

      const db = appContext.stableDb;

      // 3. Initialize _migrations table
      this.migrationRunner.initMigrationsTable(db);

      // 4. Determine pending migrations
      const executedVersions = this.migrationRunner.getExecutedVersions(db);
      const pendingMigrations = this.migrationRunner.getPendingMigrations(allMigrations, executedVersions);

      if (pendingMigrations.length === 0 && !isNewApp) {
        // No migrations to apply — still export functions, UI, and update versions
        this.exportFunctions(appName);
        const uiResult = this.exportUi(appName);
        this.markImmutableAndUpdateVersion(appName, allMigrations.map(m => m.version));
        this.cleanup(appContext);
        this.workspace.refreshAppState(appName);
        return { success: true, migrationsApplied: [], ui: uiResult };
      }

      // 5. Execute pending migrations
      const result = this.migrationRunner.executeMigrations(db, pendingMigrations);

      if (!result.success) {
        // Rollback: restore backup (don't update version or immutable)
        appContext.closeStable();
        this.restoreBackup(appContext.stableDbPath, backupPath, isNewApp);
        return {
          success: false,
          migrationsApplied: result.executed,
          error: `Migration failed (${result.failedMigration}): ${result.error}`,
        };
      }

      // 6. Record executed migrations
      for (const migration of pendingMigrations) {
        this.migrationRunner.recordMigration(db, migration);
      }

      // 7. Export function files from DB to stable data dir
      this.exportFunctions(appName);

      // 8. Export UI definition to stable data dir (non-blocking)
      const uiResult = this.exportUi(appName);

      // 9. Mark executed migrations immutable + update published_version
      const allExecutedVersions = [...executedVersions, ...pendingMigrations.map(m => m.version)];
      this.markImmutableAndUpdateVersion(appName, allExecutedVersions);

      // 10. Cleanup
      this.cleanup(appContext);
      this.workspace.refreshAppState(appName);

      return {
        success: true,
        migrationsApplied: result.executed,
        ui: uiResult,
      };
    } catch (err: any) {
      // Unexpected error: attempt rollback (don't update version or immutable)
      appContext.closeStable();
      this.restoreBackup(appContext.stableDbPath, backupPath, isNewApp);
      return {
        success: false,
        migrationsApplied: [],
        error: `Unexpected error: ${err.message}`,
      };
    }
  }

  /** Mark executed migration files as immutable and update published_version */
  private markImmutableAndUpdateVersion(appName: string, executedVersions: number[]): void {
    const platformDb = this.workspace.getPlatformDb();

    // Mark all executed migration files as immutable
    for (const version of executedVersions) {
      const versionPrefix = String(version).padStart(3, '0');
      platformDb.query(
        "UPDATE app_files SET immutable = 1 WHERE app_name = ? AND path LIKE ?",
      ).run(appName, `migrations/${versionPrefix}_%`);
    }

    // Update published_version = current_version
    platformDb.query(
      "UPDATE apps SET published_version = current_version, updated_at = datetime('now') WHERE name = ?",
    ).run(appName);
  }

  /** Export function files from DB to stable data dir */
  private exportFunctions(appName: string): void {
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) return;

    const destDir = join(appContext.stableDataDir, 'functions');
    const platformDb = this.workspace.getPlatformDb();
    exportFunctionsFromDb(platformDb, appName, destDir);
  }

  /** Export UI definition from DB to stable data dir (non-blocking) */
  private exportUi(appName: string): PublishResult['ui'] {
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) return undefined;

    try {
      const platformDb = this.workspace.getPlatformDb();
      const exported = exportUiFromDb(platformDb, appName, appContext.stableDataDir);
      if (exported) {
        return { exported: true };
      }
      return undefined;
    } catch (err: unknown) {
      console.warn(`[publisher] UI export failed for '${appName}':`, err instanceof Error ? err.message : err);
      return { exported: false };
    }
  }

  /** Restore stable database from backup */
  private restoreBackup(stableDbPath: string, backupPath: string, isNewApp: boolean): void {
    if (isNewApp) {
      // New app: just delete the failed stable DB
      if (existsSync(stableDbPath)) {
        unlinkSync(stableDbPath);
      }
      return;
    }

    if (existsSync(backupPath)) {
      // Remove failed DB files
      if (existsSync(stableDbPath)) unlinkSync(stableDbPath);
      const walPath = stableDbPath + '-wal';
      const shmPath = stableDbPath + '-shm';
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);

      // Restore from backup
      copyFileSync(backupPath, stableDbPath);
    }
  }

  /** Cleanup draft database, draft UI files, and refresh state */
  private cleanup(appContext: ReturnType<Workspace['getOrCreateApp']> & {}): void {
    try {
      appContext.resetDraft();
    } catch {
      // Best effort cleanup
    }
    // Clean draft UI files (best-effort)
    try {
      const draftUiDir = join(appContext.draftDataDir, 'ui');
      if (existsSync(draftUiDir)) {
        rmSync(draftUiDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    }
  }
}
