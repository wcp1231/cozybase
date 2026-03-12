import { uiDistEntry, uiDistStyles, repoRoot } from './lib/cozybase';
import { shutdownCommands, spawnCommand, waitForPaths, workspaceScript } from './lib/process';

const running = [
  spawnCommand({
    label: 'ui',
    cmd: workspaceScript('@cozybase/ui', 'dev'),
    cwd: repoRoot,
  }),
];

let shuttingDown = false;

async function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  await shutdownCommands(running);
}

process.on('SIGINT', async () => {
  await stopAll();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  await stopAll();
  process.exit(143);
});

try {
  await Promise.race([
    waitForPaths([uiDistEntry, uiDistStyles]),
    running[0].done.then(() => {
      throw new Error('UI watch exited before the initial bundle was ready.');
    }),
  ]);

  running.push(
    spawnCommand({
      label: 'web',
      cmd: workspaceScript('@cozybase/web', 'dev'),
      cwd: repoRoot,
    }),
    spawnCommand({
      label: 'daemon',
      cmd: workspaceScript('@cozybase/daemon', 'dev'),
      cwd: repoRoot,
    }),
  );

  await Promise.race(running.map((command) => command.done));
  await stopAll();
} catch (error) {
  await stopAll();
  throw error;
}
