import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { SeedLoader } from './seed-loader';
import { exportFunctionsFromDb, exportUiFromDb } from './file-export';
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
  ui?: { exported: boolean };
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

    // 2. Query migrations from app_files
    const platformDb = this.workspace.getPlatformDb();
    const migrationRecords = platformDb.query(
      "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'migrations/%' ORDER BY path",
    ).all(appName) as { path: string; content: string }[];

    const migrations = MigrationRunner.fromDbRecords(migrationRecords);

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

    // 4. Load seeds from app_files
    const seedRecords = platformDb.query(
      "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'seeds/%' ORDER BY path",
    ).all(appName) as { path: string; content: string }[];

    const seedResult = this.seedLoader.loadSeedsFromRecords(db, seedRecords);

    if (!seedResult.success) {
      return {
        success: false,
        migrations: migrationResult.executed,
        seeds: seedResult.loaded,
        error: `Seed loading failed (${seedResult.failedSeed}): ${seedResult.error}`,
      };
    }

    // 5. Export functions from DB to draft directory
    const draftFunctionsDir = join(this.workspace.draftDir, 'apps', appName, 'functions');
    exportFunctionsFromDb(platformDb, appName, draftFunctionsDir);

    // 6. Validate functions (optional, non-blocking)
    const functionsResult = await this.validateFunctions(appName);

    // 7. Export UI definition (non-blocking)
    let uiResult: DraftReconcileResult['ui'];
    try {
      const draftAppDir = join(this.workspace.draftDir, 'apps', appName);
      const exported = exportUiFromDb(platformDb, appName, draftAppDir);
      if (exported) {
        uiResult = { exported: true };
      }
    } catch (err: unknown) {
      console.warn(`[reconciler] UI export failed for '${appName}':`, err instanceof Error ? err.message : err);
      uiResult = { exported: false };
    }

    return {
      success: true,
      migrations: migrationResult.executed,
      seeds: seedResult.loaded,
      functions: functionsResult,
      ui: uiResult,
    };
  }

  /** Validate all function files for an app (non-blocking, reads from draft dir) */
  private async validateFunctions(appName: string): Promise<DraftReconcileResult['functions']> {
    const functionsDir = join(this.workspace.draftDir, 'apps', appName, 'functions');
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
