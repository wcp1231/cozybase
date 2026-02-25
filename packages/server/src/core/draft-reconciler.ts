import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { SeedLoader } from './seed-loader';
import { BadRequestError } from './errors';
import { HTTP_METHODS } from '../modules/functions/types';

// --- Types ---

export interface FunctionValidationResult {
  name: string;
  valid: boolean;
  error?: string;
}

export interface DraftReconcileResult {
  success: boolean;
  migrations: string[];  // executed migration filenames
  seeds: string[];       // loaded seed filenames
  functions?: {
    validated: string[];
    warnings: FunctionValidationResult[];
  };
  error?: string;
}

// --- DraftReconciler ---

export class DraftReconciler {
  private migrationRunner = new MigrationRunner();
  private seedLoader = new SeedLoader();

  constructor(private workspace: Workspace) {}

  /** Reconcile a draft app: destroy and rebuild draft database */
  async reconcile(appName: string): Promise<DraftReconcileResult> {
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

    // 5. Validate functions (optional, non-blocking)
    const functionsResult = await this.validateFunctions(appName);

    return {
      success: true,
      migrations: migrationResult.executed,
      seeds: seedResult.loaded,
      functions: functionsResult,
    };
  }

  /** Validate all function files for an app (non-blocking) */
  private async validateFunctions(appName: string): Promise<DraftReconcileResult['functions']> {
    const functionsDir = join(this.workspace.appsDir, appName, 'functions');
    if (!existsSync(functionsDir)) {
      return undefined;
    }

    const files = readdirSync(functionsDir).filter(
      (f) => f.endsWith('.ts') && !f.startsWith('_'),
    );

    if (files.length === 0) {
      return undefined;
    }

    const validated: string[] = [];
    const warnings: FunctionValidationResult[] = [];

    for (const file of files) {
      const name = file.replace(/\.ts$/, '');
      const filePath = join(functionsDir, file);

      try {
        const mod = await import(filePath + '?t=' + Date.now());

        // Check for valid exports
        const hasDefault = typeof mod.default === 'function';
        const hasMethodExport = HTTP_METHODS.some(
          (m) => typeof mod[m] === 'function',
        );

        if (!hasDefault && !hasMethodExport) {
          warnings.push({
            name,
            valid: false,
            error: 'No valid handler export found (need default export or HTTP method export)',
          });
        } else {
          validated.push(name);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push({ name, valid: false, error: message });
      }
    }

    return { validated, warnings };
  }
}
