import { join, resolve } from 'path';

import { runCommand, workspaceScript } from './process';

export const repoRoot = resolve(import.meta.dir, '..', '..');
export const uiDistEntry = join(repoRoot, 'packages', 'ui', 'dist', 'index.js');
export const uiDistStyles = join(repoRoot, 'packages', 'ui', 'dist', 'styles', 'base.css');

export async function buildWebArtifacts() {
  await runCommand({
    label: 'ui',
    cmd: workspaceScript('@cozybase/ui', 'build'),
    cwd: repoRoot,
  });

  await runCommand({
    label: 'web',
    cmd: workspaceScript('@cozybase/web', 'build'),
    cwd: repoRoot,
  });
}

export async function prepareDesktopArtifacts() {
  await buildWebArtifacts();
  await runCommand({
    label: 'desktop',
    cmd: workspaceScript('@cozybase/desktop', 'prepare:app'),
    cwd: repoRoot,
  });
}
