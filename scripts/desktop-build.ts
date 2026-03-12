import { buildWebArtifacts, repoRoot } from './lib/cozybase';
import { runCommand, workspaceScript } from './lib/process';

await buildWebArtifacts();

await runCommand({
  label: 'desktop',
  cmd: workspaceScript('@cozybase/desktop', 'build:app'),
  cwd: repoRoot,
  prefixOutput: false,
});
