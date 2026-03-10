import type { CozyBaseActionContext } from '@cozybase/cozybase-agent';

type CallApiFn = (path: string, options?: RequestInit) => Promise<Response>;

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload?.error?.message) {
        return payload.error.message;
      }
    } catch {
      // Fall through to text body handling.
    }
  }

  const text = await response.text();
  return text || response.statusText || 'Unknown error';
}

async function invokeAction<T>(callApi: CallApiFn, actionName: string, input: unknown): Promise<T> {
  const response = await callApi(`/internal/cozybase/actions/${encodeURIComponent(actionName)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input ?? {}),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`CozyBase action '${actionName}' failed (${response.status}): ${message}`);
  }

  const payload = await response.json() as { data: T };
  return payload.data;
}

export function createRemoteCozyBaseActionContext(callApi: CallApiFn): CozyBaseActionContext {
  return {
    listApps: () => invokeAction(callApi, 'list_apps', {}),
    getAppDetail: (appName) => invokeAction(callApi, 'get_app_detail', { app_name: appName }),
    startApp: (appName) => invokeAction(callApi, 'start_app', { app_name: appName }),
    stopApp: (appName) => invokeAction(callApi, 'stop_app', { app_name: appName }),
    deleteApp: (appName) => invokeAction(callApi, 'delete_app', { app_name: appName }),
    createApp: (idea) => invokeAction(callApi, 'create_app', { idea }),
    developApp: (appName, instruction) => invokeAction(callApi, 'develop_app', {
      app_name: appName,
      instruction,
    }),
    operateApp: (appName, instruction) => invokeAction(callApi, 'operate_app', {
      app_name: appName,
      instruction,
    }),
  };
}
