import { prepareDesktopArtifacts, repoRoot } from './lib/cozybase';
import { runCommand, workspaceScript } from './lib/process';

await prepareDesktopArtifacts();

await runCommand({
  label: 'desktop',
  cmd: workspaceScript('@cozybase/desktop', 'build:app'),
  cwd: repoRoot,
  prefixOutput: false,
});
