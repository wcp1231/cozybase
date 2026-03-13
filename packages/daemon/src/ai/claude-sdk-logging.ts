import { daemonLogger } from '../core/daemon-logger';
import { spawn } from 'child_process';

function resolveSpawnCommand(
  command: string,
  env: Record<string, string | undefined>,
): string {
  if (command !== 'bun') {
    return command;
  }

  const configuredBunPath = env.COZYBASE_BUN_PATH?.trim();
  if (configuredBunPath) {
    return configuredBunPath;
  }

  const currentExecPath = process.execPath?.trim();
  if (currentExecPath) {
    return currentExecPath;
  }

  return command;
}

export function buildClaudeSdkLoggingOptions(scope: string, appSlug?: string): {
  stderr: (data: string) => void;
  spawnClaudeCodeProcess: (options: {
    command: string;
    args: string[];
    cwd?: string;
    env: Record<string, string | undefined>;
    signal: AbortSignal;
  }) => ReturnType<typeof spawn>;
} {
  return {
    stderr: (data: string) => {
      const message = data.trim();
      if (!message) {
        return;
      }

      daemonLogger.debug('[claude-sdk stderr]', {
        scope,
        appSlug: appSlug ?? null,
        message,
      });
    },
    spawnClaudeCodeProcess: (options) => {
      const resolvedCommand = resolveSpawnCommand(options.command, options.env);
      daemonLogger.info('[claude-sdk spawn]', {
        scope,
        appSlug: appSlug ?? null,
        command: options.command,
        resolvedCommand,
        cwd: options.cwd ?? null,
      });

      const child = spawn(resolvedCommand, options.args, {
        cwd: options.cwd,
        env: options.env,
        signal: options.signal,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      daemonLogger.info('[claude-sdk spawn pid]', {
        scope,
        appSlug: appSlug ?? null,
        pid: child.pid ?? null,
      });

      child.stderr?.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (!message) {
          return;
        }
        daemonLogger.debug('[claude-sdk stderr]', {
          scope,
          appSlug: appSlug ?? null,
          message,
        });
      });

      child.on('exit', (code, signal) => {
        if (code === 0 && signal == null) {
          return;
        }

        daemonLogger.warn('[claude-sdk exit]', {
          scope,
          appSlug: appSlug ?? null,
          pid: child.pid ?? null,
          code,
          signal,
        });
      });

      child.on('error', (error) => {
        daemonLogger.error('[claude-sdk spawn error]', {
          scope,
          appSlug: appSlug ?? null,
          pid: child.pid ?? null,
          message: error.message,
        });
      });

      return child;
    },
  };
}
