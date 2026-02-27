import type { Hono } from 'hono';

export interface AuthVerifyResult {
  authenticated: boolean;
  user?: { id: string; name: string; role: string };
  error?: string;
}

export interface DaemonClient {
  verifyAuth(authorizationHeader: string): Promise<AuthVerifyResult>;
  getThemeCSS(): Promise<string>;
}

/**
 * Create a DaemonClient that calls Daemon via Hono app.request() (same process).
 */
export function createInProcessDaemonClient(daemonApp: Hono): DaemonClient {
  return {
    async verifyAuth(authorizationHeader: string): Promise<AuthVerifyResult> {
      const res = await daemonApp.request('/internal/auth/verify', {
        method: 'POST',
        headers: { Authorization: authorizationHeader },
      });
      return res.json();
    },
    async getThemeCSS(): Promise<string> {
      const res = await daemonApp.request('/api/v1/theme/css');
      return res.text();
    },
  };
}

/**
 * Create a DaemonClient that calls Daemon via HTTP fetch (separate process).
 */
export function createHttpDaemonClient(baseUrl: string): DaemonClient {
  return {
    async verifyAuth(authorizationHeader: string): Promise<AuthVerifyResult> {
      const res = await fetch(`${baseUrl}/internal/auth/verify`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader },
      });
      return res.json();
    },
    async getThemeCSS(): Promise<string> {
      const res = await fetch(`${baseUrl}/api/v1/theme/css`);
      return res.text();
    },
  };
}
