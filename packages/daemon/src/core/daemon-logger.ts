import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { PlatformRepository } from './platform-repository';
import { resolveDaemonLogFilePath } from '../runtime-paths';

export const DAEMON_LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const;

export type DaemonLogLevel = typeof DAEMON_LOG_LEVELS[number];

const LOG_LEVEL_RANK: Record<DaemonLogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
};

const DEFAULT_LOG_LEVEL: DaemonLogLevel = 'INFO';

function isDaemonLogLevel(value: string | null | undefined): value is DaemonLogLevel {
  return value === 'DEBUG' || value === 'INFO' || value === 'WARNING' || value === 'ERROR';
}

function sanitizeLogText(value: string): string {
  return value.replace(/\r?\n/g, '\\n');
}

function serializeContext(context: unknown): string {
  if (context === undefined) {
    return '';
  }
  if (typeof context === 'string') {
    return sanitizeLogText(context);
  }
  if (context instanceof Error) {
    return sanitizeLogText(JSON.stringify({
      name: context.name,
      message: context.message,
      stack: context.stack,
    }));
  }

  try {
    return sanitizeLogText(JSON.stringify(context));
  } catch {
    return sanitizeLogText(String(context));
  }
}

class DaemonLogger {
  private platformRepo: PlatformRepository | null = null;

  configure(platformRepo: PlatformRepository): void {
    this.platformRepo = platformRepo;
  }

  debug(message: string, context?: unknown): void {
    this.write('DEBUG', message, context);
  }

  info(message: string, context?: unknown): void {
    this.write('INFO', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.write('WARNING', message, context);
  }

  error(message: string, context?: unknown): void {
    this.write('ERROR', message, context);
  }

  private write(level: DaemonLogLevel, message: string, context?: unknown): void {
    try {
      if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[this.getCurrentLevel()]) {
        return;
      }

      const logPath = resolveDaemonLogFilePath();
      mkdirSync(dirname(logPath), { recursive: true });

      const renderedMessage = sanitizeLogText(message);
      const renderedContext = serializeContext(context);
      const suffix = renderedContext ? ` ${renderedContext}` : '';
      appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${renderedMessage}${suffix}\n`, 'utf-8');
    } catch {
      // Logging must never break daemon execution.
    }
  }

  private getCurrentLevel(): DaemonLogLevel {
    try {
      const stored = this.platformRepo?.settings.get('daemon.log_level');
      return isDaemonLogLevel(stored) ? stored : DEFAULT_LOG_LEVEL;
    } catch {
      return DEFAULT_LOG_LEVEL;
    }
  }
}

export const daemonLogger = new DaemonLogger();
