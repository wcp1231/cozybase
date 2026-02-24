import { watch, type FSWatcher } from 'fs';
import { join, relative, sep } from 'path';
import type { Reconciler } from './reconciler';
import { loadAppDefinition } from './workspace';

export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: Timer | null = null;
  private changedApps = new Set<string>();

  constructor(
    private workspaceDir: string,
    private reconciler: Reconciler,
  ) {}

  start(): void {
    this.watcher = watch(this.workspaceDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;

      // Ignore hidden files and non-relevant changes
      if (filename.startsWith('.')) return;

      const appName = this.extractAppName(filename);
      if (appName) {
        this.changedApps.add(appName);
        this.scheduleReconcile();
      }
    });

    console.log(`Watching workspace: ${this.workspaceDir}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private extractAppName(filename: string): string | null {
    // filename is relative to workspaceDir, e.g. "todo-app/tables/users.yaml"
    const parts = filename.split(sep);
    if (parts.length < 1) return null;
    const appName = parts[0];
    if (/^[a-zA-Z0-9_-]+$/.test(appName)) return appName;
    return null;
  }

  private scheduleReconcile(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const apps = [...this.changedApps];
      this.changedApps.clear();

      for (const appName of apps) {
        const appDir = join(this.workspaceDir, appName);
        const app = loadAppDefinition(appName, appDir);
        if (!app) continue;

        try {
          const changes = this.reconciler.reconcileApp(app);
          for (const change of changes) {
            const icon = change.warning ? '⚠' : '✓';
            console.log(`  ${icon} [${change.app}] ${change.type}: ${change.resource}${change.detail ? ` (${change.detail})` : ''}`);
          }
          if (changes.length === 0) {
            // No structural changes, might be a function source update
          }
        } catch (err: any) {
          console.error(`  ✗ [${appName}] Reconcile error: ${err.message}`);
        }
      }
    }, 500);
  }
}
