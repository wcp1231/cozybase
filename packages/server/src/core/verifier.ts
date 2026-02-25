import { Database } from 'bun:sqlite';
import { join } from 'path';
import { readFileSync, readdirSync, existsSync, unlinkSync, copyFileSync, mkdirSync } from 'fs';
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

    // 1. Check committed migration immutability
    const immutabilityError = this.checkMigrationImmutability(appName);
    if (immutabilityError) {
      return {
        success: false,
        migrationsToApply: [],
        error: immutabilityError,
      };
    }

    // 2. Scan all migrations and determine pending ones
    const migrationsDir = join(this.workspace.appsDir, appName, 'migrations');
    const allMigrations = this.migrationRunner.scanMigrations(migrationsDir);

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

  /** Check that no committed migration files have been modified */
  private checkMigrationImmutability(appName: string): string | null {
    const migrationsDir = join(this.workspace.appsDir, appName, 'migrations');
    if (!existsSync(migrationsDir)) return null;

    const files = readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();

    for (const filename of files) {
      const relativePath = `apps/${appName}/migrations/${filename}`;

      // Check if this file is tracked by git
      if (!this.workspace.isFileCommitted(relativePath)) {
        continue; // New file, not committed yet — that's fine
      }

      // Get committed version
      const committedContent = this.workspace.getCommittedFileContent(relativePath);
      if (committedContent === null) {
        continue; // Not in HEAD (should not happen if isFileCommitted is true)
      }

      // Compare with working copy
      const workingContent = readFileSync(join(migrationsDir, filename), 'utf-8');
      if (committedContent !== workingContent) {
        return `Migration ${filename} has been modified after commit. Already-published migrations are immutable. Please create a new migration to make changes.`;
      }
    }

    return null;
  }
}
