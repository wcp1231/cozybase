import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, unlinkSync, copyFileSync, mkdirSync } from 'fs';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { BadRequestError } from './errors';

// --- Types ---

export interface VerifyResult {
  success: boolean;
  migrationsToApply: string[];  // filenames of new migrations
  error?: string;
  detail?: string;              // change summary
}

// --- Verifier ---

export class Verifier {
  private migrationRunner = new MigrationRunner();

  constructor(private workspace: Workspace) {}

  /** Verify that draft migrations can be safely applied to stable database */
  verify(appName: string): VerifyResult {
    // Validate app state
    const state = this.workspace.getAppState(appName);
    if (!state) {
      throw new BadRequestError(`App '${appName}' not found`);
    }
    if (state === 'deleted') {
      throw new BadRequestError(`App '${appName}' is deleted`);
    }
    if (state === 'draft_only') {
      throw new BadRequestError(`App '${appName}' has no stable version to verify against`);
    }
    if (state === 'stable') {
      throw new BadRequestError(`App '${appName}' has no draft changes to verify`);
    }

    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new BadRequestError(`App '${appName}' not found`);
    }

    // 1. Check migration immutability (DB-based)
    const immutabilityError = this.checkMigrationImmutability(appName);
    if (immutabilityError) {
      return {
        success: false,
        migrationsToApply: [],
        error: immutabilityError,
      };
    }

    // 2. Query all migrations from app_files and determine pending ones
    const platformDb = this.workspace.getPlatformDb();
    const migrationRecords = platformDb.query(
      "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'migrations/%' ORDER BY path",
    ).all(appName) as { path: string; content: string }[];

    const allMigrations = MigrationRunner.fromDbRecords(migrationRecords);

    // Read executed versions from stable DB
    const executedVersions = this.migrationRunner.getExecutedVersions(appContext.stableDb);
    const pendingMigrations = this.migrationRunner.getPendingMigrations(allMigrations, executedVersions);

    if (pendingMigrations.length === 0) {
      return {
        success: true,
        migrationsToApply: [],
        detail: 'No new migrations to apply',
      };
    }

    // 3. WAL checkpoint and copy stable DB to temp
    const tempDbPath = join(appContext.draftDataDir, 'verify_temp.sqlite');

    try {
      // Ensure draft dir exists for temp file
      mkdirSync(appContext.draftDataDir, { recursive: true });

      // Checkpoint to ensure WAL is flushed
      appContext.stableDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');

      // Close stable connection before copying
      appContext.closeStable();

      // Copy stable DB to temp
      copyFileSync(appContext.stableDbPath, tempDbPath);

      // 4. Execute pending migrations on temp DB
      const tempDb = new Database(tempDbPath);
      tempDb.exec('PRAGMA journal_mode = WAL');
      tempDb.exec('PRAGMA foreign_keys = ON');

      try {
        const result = this.migrationRunner.executeMigrations(tempDb, pendingMigrations);

        if (!result.success) {
          return {
            success: false,
            migrationsToApply: pendingMigrations.map((m) => m.filename),
            error: `Migration failed (${result.failedMigration}): ${result.error}`,
          };
        }

        return {
          success: true,
          migrationsToApply: pendingMigrations.map((m) => m.filename),
          detail: `${pendingMigrations.length} migration(s) can be safely applied: ${pendingMigrations.map((m) => m.filename).join(', ')}`,
        };
      } finally {
        tempDb.close();
      }
    } finally {
      // Cleanup temp file
      if (existsSync(tempDbPath)) {
        unlinkSync(tempDbPath);
      }
      // Also clean WAL/SHM files
      const walPath = tempDbPath + '-wal';
      const shmPath = tempDbPath + '-shm';
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    }
  }

  /** Check that already-executed migrations have not been modified (DB-based immutability) */
  private checkMigrationImmutability(appName: string): string | null {
    const platformDb = this.workspace.getPlatformDb();
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) return null;

    // Get executed migration versions from stable DB
    const executedVersions = this.migrationRunner.getExecutedVersions(appContext.stableDb);
    if (executedVersions.length === 0) return null;

    // For each executed version, check that the corresponding app_files record exists and is immutable
    for (const version of executedVersions) {
      const versionPrefix = String(version).padStart(3, '0');
      const record = platformDb.query(
        "SELECT path, immutable FROM app_files WHERE app_name = ? AND path LIKE ? LIMIT 1",
      ).get(appName, `migrations/${versionPrefix}_%`) as { path: string; immutable: number } | null;

      if (!record) {
        return `Migration version ${versionPrefix} was previously executed but its file is missing from app_files. This is a data integrity issue.`;
      }

      if (!record.immutable) {
        return `Migration ${record.path.replace('migrations/', '')} has been executed but is not marked as immutable. Already-published migrations must not be modified.`;
      }
    }

    return null;
  }
}
