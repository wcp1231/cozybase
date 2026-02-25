import { join } from 'path';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { SeedLoader } from './seed-loader';
import { BadRequestError } from './errors';

// --- Types ---

export interface DraftReconcileResult {
  success: boolean;
  migrations: string[];  // executed migration filenames
  seeds: string[];       // loaded seed filenames
  error?: string;
}

// --- DraftReconciler ---

export class DraftReconciler {
  private migrationRunner = new MigrationRunner();
  private seedLoader = new SeedLoader();

  constructor(private workspace: Workspace) {}

  /** Reconcile a draft app: destroy and rebuild draft database */
  reconcile(appName: string): DraftReconcileResult {
    // Validate app state
    const state = this.workspace.getAppState(appName);
    if (!state) {
      throw new BadRequestError(`App '${appName}' not found`);
    }
    if (state === 'deleted') {
      throw new BadRequestError(`App '${appName}' is deleted`);
    }
    if (state === 'stable') {
      throw new BadRequestError(`App '${appName}' has no draft changes`);
    }

    // Get or create AppContext
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new BadRequestError(`App '${appName}' not found`);
    }

    // 1. Destroy draft database
    appContext.resetDraft();

    // 2. Scan migrations
    const migrationsDir = join(this.workspace.appsDir, appName, 'migrations');
    const migrations = this.migrationRunner.scanMigrations(migrationsDir);

    // 3. Execute all migrations on fresh draft database
    const db = appContext.draftDb;
    const migrationResult = this.migrationRunner.executeMigrations(db, migrations);

    if (!migrationResult.success) {
      return {
        success: false,
        migrations: migrationResult.executed,
        seeds: [],
        error: `Migration failed (${migrationResult.failedMigration}): ${migrationResult.error}`,
      };
    }

    // 4. Load seeds
    const seedsDir = join(this.workspace.appsDir, appName, 'seeds');
    const seedResult = this.seedLoader.loadSeeds(db, seedsDir);

    if (!seedResult.success) {
      return {
        success: false,
        migrations: migrationResult.executed,
        seeds: seedResult.loaded,
        error: `Seed loading failed (${seedResult.failedSeed}): ${seedResult.error}`,
      };
    }

    return {
      success: true,
      migrations: migrationResult.executed,
      seeds: seedResult.loaded,
    };
  }
}
