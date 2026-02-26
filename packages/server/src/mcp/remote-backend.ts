/**
 * RemoteBackend — Remote mode implementation of CozybaseBackend.
 *
 * Communicates with a cozybase daemon via HTTP API.
 * Used when cozybase runs on a different machine (e.g., Homelab).
 */

import type {
  CozybaseBackend,
  AppSnapshot,
  AppInfo,
  FileEntry,
  PushResult,
  SqlResult,
  ApiResponse,
  DraftReconcileResult,
  VerifyResult,
  PublishResult,
} from './types';

export class RemoteBackend implements CozybaseBackend {
  constructor(private baseUrl: string) {
    // Normalize: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // --- App Lifecycle ---

  async createApp(name: string, description?: string): Promise<AppSnapshot> {
    const res = await this.request('POST', '/api/v1/apps', {
      name,
      description: description ?? '',
    });
    const app = res.data;
    return {
      name: app.name,
      description: app.description ?? '',
      state: app.state ?? 'unknown',
      current_version: app.current_version ?? 0,
      published_version: app.published_version ?? 0,
      files: (app.files ?? []).map((f: any) => ({ path: f.path, content: f.content })),
    };
  }

  async listApps(): Promise<AppInfo[]> {
    const res = await this.request('GET', '/api/v1/apps');
    return (res.data ?? []).map((a: any) => ({
      name: a.name,
      description: a.description ?? '',
      state: a.state ?? 'unknown',
      current_version: a.current_version ?? 0,
      published_version: a.published_version ?? 0,
    }));
  }

  async fetchApp(name: string): Promise<AppSnapshot> {
    const res = await this.request('GET', `/api/v1/apps/${encodeURIComponent(name)}`);
    const app = res.data;
    return {
      name: app.name,
      description: app.description ?? '',
      state: app.state ?? 'unknown',
      current_version: app.current_version ?? 0,
      published_version: app.published_version ?? 0,
      files: (app.files ?? []).map((f: any) => ({ path: f.path, content: f.content })),
    };
  }

  async deleteApp(name: string): Promise<void> {
    await this.request('DELETE', `/api/v1/apps/${encodeURIComponent(name)}`);
  }

  // --- File Sync ---

  async pushFiles(name: string, files: FileEntry[]): Promise<PushResult> {
    // Fetch current version for the optimistic lock required by the API
    const app = await this.fetchApp(name);

    const res = await this.request(
      'PUT',
      `/api/v1/apps/${encodeURIComponent(name)}`,
      {
        base_version: app.current_version,
        files: files.map((f) => ({ path: f.path, content: f.content })),
      },
    );

    return {
      files: files.map((f) => f.path),
      changes: {
        added: res.data?.added ?? [],
        modified: res.data?.modified ?? [],
        deleted: res.data?.deleted ?? [],
      },
    };
  }

  async pushFile(name: string, path: string, content: string): Promise<'created' | 'updated'> {
    const res = await this.request(
      'PUT',
      `/api/v1/apps/${encodeURIComponent(name)}/files/${path}`,
      { content },
    );
    return res.data?.status === 'created' ? 'created' : 'updated';
  }

  // --- Dev Workflow ---

  async reconcile(name: string): Promise<DraftReconcileResult> {
    const res = await this.request(
      'POST',
      `/draft/apps/${encodeURIComponent(name)}/reconcile`,
    );
    return res.data;
  }

  async verify(name: string): Promise<VerifyResult> {
    const res = await this.request(
      'POST',
      `/draft/apps/${encodeURIComponent(name)}/verify`,
    );
    return res.data;
  }

  async publish(name: string): Promise<PublishResult> {
    const res = await this.request(
      'POST',
      `/draft/apps/${encodeURIComponent(name)}/publish`,
    );
    return res.data;
  }

  // --- Runtime Interaction ---

  async executeSql(name: string, sql: string, mode: string): Promise<SqlResult> {
    const sqlMode = mode === 'stable' ? 'stable' : 'draft';
    const res = await this.request(
      'POST',
      `/${sqlMode}/apps/${encodeURIComponent(name)}/db/_sql`,
      { sql },
    );
    return {
      columns: res.data.columns ?? [],
      rows: res.data.rows ?? [],
      rowCount: res.data.rowCount ?? 0,
    };
  }

  async callApi(
    name: string,
    method: string,
    path: string,
    body?: unknown,
    mode?: string,
  ): Promise<ApiResponse> {
    const appMode = mode === 'stable' ? 'stable' : 'draft';
    const url = `${this.baseUrl}/${appMode}/apps/${encodeURIComponent(name)}${path}`;

    const init: RequestInit = { method: method.toUpperCase() };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    const response = await fetch(url, init);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let responseBody: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers,
      body: responseBody,
    };
  }

  // --- Internal ---

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err: any) {
      throw new Error(`Failed to connect to cozybase at ${this.baseUrl}: ${err.message}`);
    }

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      const errorMessage = errorBody?.error?.message
        ?? (typeof errorBody === 'string' ? errorBody : `HTTP ${response.status}`);
      const errorCode = errorBody?.error?.code ?? `HTTP_${response.status}`;

      throw new Error(`[${errorCode}] ${errorMessage}`);
    }

    return response.json();
  }
}
