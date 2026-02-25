import { join } from 'path';
import { existsSync, copyFileSync, unlinkSync, mkdirSync, readdirSync, rmSync } from 'fs';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { BadRequestError } from './errors';
import type { FunctionRuntime } from '../modules/functions/types';

// --- Types ---

export interface PublishResult {
  success: boolean;
  migrationsApplied: string[];  // filenames of applied migrations
  error?: string;
}

// --- Publisher ---

export class Publisher {
  private migrationRunner = new MigrationRunner();
  private functionRuntime: FunctionRuntime | null = null;

  constructor(private workspace: Workspace) {}

  /** Set the function runtime for reload notifications */
  setFunctionRuntime(runtime: FunctionRuntime): void {
    this.functionRuntime = runtime;
  }

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

    try {
      // 2. Scan migrations
      const migrationsDir = join(this.workspace.appsDir, appName, 'migrations');
      const allMigrations = this.migrationRunner.scanMigrations(migrationsDir);

      const db = appContext.stableDb;

      // 3. Initialize _migrations table
      this.migrationRunner.initMigrationsTable(db);

      // 4. Determine pending migrations
      const executedVersions = this.migrationRunner.getExecutedVersions(db);
      const pendingMigrations = this.migrationRunner.getPendingMigrations(allMigrations, executedVersions);

      if (pendingMigrations.length === 0 && !isNewApp) {
        // No migrations to apply — still commit file changes (functions, seeds, etc.)
        this.copyFunctionsToStable(appName);
        this.reloadFunctions(appName);
        this.commitChanges(appName, 'no new migrations');
        this.cleanup(appContext);
        this.workspace.refreshAppState(appName);
        return { success: true, migrationsApplied: [] };
      }

      // 5. Execute pending migrations
      const result = this.migrationRunner.executeMigrations(db, pendingMigrations);

      if (!result.success) {
        // Rollback: restore backup
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

      // 7. Copy function files to stable data dir
      this.copyFunctionsToStable(appName);

      // 8. Reload functions
      this.reloadFunctions(appName);

      // 8. Git commit
      const summary = pendingMigrations.map((m) => m.filename).join(', ');
      this.commitChanges(appName, summary);

      // 8. Cleanup
      this.cleanup(appContext);
      this.workspace.refreshAppState(appName);

      return {
        success: true,
        migrationsApplied: result.executed,
      };
    } catch (err: any) {
      // Unexpected error: attempt rollback
      appContext.closeStable();
      this.restoreBackup(appContext.stableDbPath, backupPath, isNewApp);
      return {
        success: false,
        migrationsApplied: [],
        error: `Unexpected error: ${err.message}`,
      };
    }
  }

  /** Commit app changes via git */
  private commitChanges(appName: string, summary: string): void {
    try {
      this.workspace.commitApp(appName, `publish: ${appName} - ${summary}`);
    } catch (err: any) {
      console.warn(`[publisher] Git commit failed: ${err.message}`);
    }
  }

  /** Notify FunctionRuntime to reload cached modules for this app */
  private reloadFunctions(appName: string): void {
    if (this.functionRuntime) {
      this.functionRuntime.reload(appName).catch((err) => {
        console.warn(`[publisher] Function reload failed for '${appName}': ${err.message}`);
      });
    }
  }

  /** Copy function files from workspace to stable data dir (published snapshot) */
  private copyFunctionsToStable(appName: string): void {
    const srcDir = join(this.workspace.appsDir, appName, 'functions');
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) return;

    const destDir = join(appContext.stableDataDir, 'functions');

    // Clean destination
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }

    // Copy if source exists
    if (existsSync(srcDir)) {
      mkdirSync(destDir, { recursive: true });
      const files = readdirSync(srcDir);
      for (const file of files) {
        copyFileSync(join(srcDir, file), join(destDir, file));
      }
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

  /** Cleanup draft database and refresh state */
  private cleanup(appContext: ReturnType<Workspace['getOrCreateApp']> & {}): void {
    try {
      appContext.resetDraft();
    } catch {
      // Best effort cleanup
    }
  }
}
