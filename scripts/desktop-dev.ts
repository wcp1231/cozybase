import { buildWebArtifacts, repoRoot } from './lib/cozybase';
import { runCommand, workspaceScript } from './lib/process';

await buildWebArtifacts();

await runCommand({
  label: 'desktop',
  cmd: workspaceScript('@cozybase/desktop', 'dev:app'),
  cwd: repoRoot,
  prefixOutput: false,
});
