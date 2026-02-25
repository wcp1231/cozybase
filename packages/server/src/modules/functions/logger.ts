import type { Logger } from './types';

export class FunctionLogger implements Logger {
  private prefix: string;

  constructor(appName: string, functionName: string, mode: 'stable' | 'draft') {
    this.prefix = `[fn:${mode}/${appName}/${functionName}]`;
  }

  info(message: string, data?: Record<string, unknown>): void {
    console.log(this.prefix, message, data !== undefined ? JSON.stringify(data) : '');
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(this.prefix, message, data !== undefined ? JSON.stringify(data) : '');
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(this.prefix, message, data !== undefined ? JSON.stringify(data) : '');
  }

  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(this.prefix, message, data !== undefined ? JSON.stringify(data) : '');
  }
}
