import { join } from 'path';
import {
  existsSync,
  readdirSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import type { Workspace } from './workspace';
import { MigrationRunner } from './migration-runner';
import { SeedLoader } from './seed-loader';
import { exportFunctionsFromDb, exportUiFromDb } from './file-export';
import { BadRequestError } from './errors';
import { HTTP_METHODS } from '@cozybase/runtime';

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
  npm?: { installed: boolean; warning?: string };
  error?: string;
}

export interface DraftReconcileOptions {
  force?: boolean;
}

// --- DraftReconciler ---

export class DraftReconciler {
  private migrationRunner = new MigrationRunner();
  private seedLoader = new SeedLoader();

  constructor(private workspace: Workspace) {}

  /** Reconcile a draft app: rebuild draft DB only when migrations changed */
  async reconcile(
    appName: string,
    options?: DraftReconcileOptions,
  ): Promise<DraftReconcileResult> {
    // Validate app state
    const state = this.workspace.getAppState(appName);
    if (!state) {
      throw new BadRequestError(`App '${appName}' not found`);
    }
    if (!state.hasDraft && !options?.force) {
      throw new BadRequestError(`App '${appName}' has no draft changes`);
    }

    // Get or create AppContext
    const appContext = this.workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new BadRequestError(`App '${appName}' not found`);
    }

    // 1. Query migrations from app_files
    const repo = this.workspace.getPlatformRepo();
    const migrationRecords = repo.appFiles.findByAppAndPattern(appName, 'migrations/%');

    const migrations = MigrationRunner.fromDbRecords(migrationRecords);
    const migrationSignature = this.buildMigrationSignature(migrationRecords);
    const needsDbRebuild = this.shouldRebuildDraftDb(
      appContext.draftDbPath,
      appContext.draftDataDir,
      migrationSignature,
    );

    let migrationResult = { success: true, executed: [] } as {
      success: boolean;
      executed: string[];
      error?: string;
      failedMigration?: string;
    };
    let seedResult = { success: true, loaded: [] } as {
      success: boolean;
      loaded: string[];
      error?: string;
      failedSeed?: string;
    };

    if (needsDbRebuild) {
      // 2. Destroy draft database
      appContext.resetDraft();

      // 3. Execute all migrations on fresh draft database
      const db = appContext.draftDb;
      migrationResult = this.migrationRunner.executeMigrations(db, migrations);

      if (!migrationResult.success) {
        return {
          success: false,
          migrations: migrationResult.executed,
          seeds: [],
          error: `Migration failed (${migrationResult.failedMigration}): ${migrationResult.error}`,
        };
      }

      // 4. Load seeds from app_files only when the draft DB is rebuilt
      const seedRecords = repo.appFiles.findByAppAndPattern(appName, 'seeds/%');

      seedResult = this.seedLoader.loadSeedsFromRecords(db, seedRecords);

      if (!seedResult.success) {
        return {
          success: false,
          migrations: migrationResult.executed,
          seeds: seedResult.loaded,
          error: `Seed loading failed (${seedResult.failedSeed}): ${seedResult.error}`,
        };
      }

      this.writeDraftReconcileState(appContext.draftDataDir, migrationSignature);
    } else {
      this.writeDraftReconcileState(appContext.draftDataDir, migrationSignature);
    }

    // 5. Export functions from DB to draft directory
    const draftFunctionsDir = join(appContext.draftDataDir, 'functions');
    exportFunctionsFromDb(repo, appName, draftFunctionsDir);

    // 6. Validate functions (optional, non-blocking)
    const functionsResult = await this.validateFunctions(appName);

    // 7. Export UI definition (non-blocking)
    let uiResult: DraftReconcileResult['ui'];
    try {
      const exported = exportUiFromDb(repo, appName, appContext.draftDataDir);
      if (exported) {
        uiResult = { exported: true };
      }
    } catch (err: unknown) {
      console.warn(`[reconciler] UI export failed for '${appName}':`, err instanceof Error ? err.message : err);
      uiResult = { exported: false };
    }

    // 8. Export package.json and run bun install (non-blocking on failure)
    const npmResult = await this.exportPackageJsonAndInstall(appName, appContext.draftDataDir);

    return {
      success: true,
      migrations: migrationResult.executed,
      seeds: seedResult.loaded,
      functions: functionsResult,
      ui: uiResult,
      npm: npmResult,
    };
  }

  private shouldRebuildDraftDb(
    draftDbPath: string,
    draftDataDir: string,
    migrationSignature: string,
  ): boolean {
    if (!existsSync(draftDbPath)) {
      return true;
    }

    const previousState = this.readDraftReconcileState(draftDataDir);
    if (!previousState) {
      return true;
    }

    return previousState.migrationSignature !== migrationSignature;
  }

  private buildMigrationSignature(
    records: { path: string; content: string }[],
  ): string {
    const hash = createHash('sha256');
    for (const record of [...records].sort((a, b) => a.path.localeCompare(b.path))) {
      hash.update(record.path);
      hash.update('\0');
      hash.update(record.content);
      hash.update('\0');
    }
    return hash.digest('hex');
  }

  private readDraftReconcileState(
    draftDataDir: string,
  ): { migrationSignature: string } | null {
    const statePath = join(draftDataDir, '.reconcile-state.json');
    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const raw = readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(raw) as { migrationSignature?: unknown };
      return typeof parsed.migrationSignature === 'string'
        ? { migrationSignature: parsed.migrationSignature }
        : null;
    } catch {
      return null;
    }
  }

  private writeDraftReconcileState(
    draftDataDir: string,
    migrationSignature: string,
  ): void {
    mkdirSync(draftDataDir, { recursive: true });
    writeFileSync(
      join(draftDataDir, '.reconcile-state.json'),
      JSON.stringify({ migrationSignature }, null, 2),
      'utf-8',
    );
  }

  /** Validate all function files for an app (non-blocking, reads from draft dir) */
  private async validateFunctions(appName: string): Promise<DraftReconcileResult['functions']> {
    const functionsDir = join(this.workspace.draftDir, appName, 'functions');
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

  /** Export package.json from app_files to app dir, then run bun install */
  private async exportPackageJsonAndInstall(
    appName: string,
    appDir: string,
  ): Promise<DraftReconcileResult['npm']> {
    const repo = this.workspace.getPlatformRepo();
    const record = repo.appFiles.findByAppAndPath(appName, 'package.json');

    if (!record) return undefined;

    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'package.json'), record.content, 'utf-8');

    return this.runBunInstall(appDir);
  }

  /** Run bun install in the given directory; returns result without throwing on failure */
  private async runBunInstall(cwd: string): Promise<{ installed: boolean; warning?: string }> {
    try {
      const proc = Bun.spawn(['bun', 'install'], {
        cwd,
        stdout: 'ignore',
        stderr: 'pipe',
      });
      // Drain stderr before awaiting exit to avoid pipe buffer deadlock
      const stderrPromise = new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await stderrPromise;
        return {
          installed: false,
          warning: `bun install exited with code ${exitCode}: ${stderr.trim()}`,
        };
      }
      return { installed: true };
    } catch (err: any) {
      return { installed: false, warning: `bun install failed: ${err.message}` };
    }
  }
}
