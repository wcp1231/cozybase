import { prepareDesktopArtifacts, repoRoot } from './lib/cozybase';
import { runCommand, workspaceScript } from './lib/process';

await prepareDesktopArtifacts();

await runCommand({
  label: 'desktop',
  cmd: workspaceScript('@cozybase/desktop', 'dev:app'),
  cwd: repoRoot,
  prefixOutput: false,
});
