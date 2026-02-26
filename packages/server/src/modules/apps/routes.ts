import { Hono } from 'hono';
import type { Workspace } from '../../core/workspace';
import { AppManager } from './manager';
import { BadRequestError } from '../../core/errors';

export function createAppRoutes(workspace: Workspace) {
  const app = new Hono();
  const manager = new AppManager(workspace);

  // GET /apps - List all apps with derived states
  app.get('/apps', (c) => {
    const apps = manager.list();
    return c.json({ data: apps });
  });

  // POST /apps - Create a new app
  app.post('/apps', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }

    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new BadRequestError('Request body must include a non-empty "name" field');
    }

    const description = typeof body.description === 'string' ? body.description : '';
    const result = manager.create(body.name.trim(), description);
    return c.json({ data: { ...result.app, api_key: result.apiKey } }, 201);
  });

  // GET /apps/:name - Get single app with files
  app.get('/apps/:name', (c) => {
    const name = c.req.param('name')!;
    const appWithFiles = manager.getAppWithFiles(name);
    return c.json({ data: appWithFiles });
  });

  // PUT /apps/:name - Whole-app update (optimistic lock)
  app.put('/apps/:name', async (c) => {
    const name = c.req.param('name')!;

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }

    if (typeof body.base_version !== 'number' || !Array.isArray(body.files)) {
      throw new BadRequestError('Request body must include "base_version" (number) and "files" (array)');
    }

    const result = manager.updateApp(
      name,
      body.files as { path: string; content: string }[],
      body.base_version,
    );
    return c.json({ data: result });
  });

  // PUT /apps/:name/files/* - Single file update
  app.put('/apps/:name/files/*', async (c) => {
    const name = c.req.param('name')!;
    const filePath = c.req.path.replace(`/api/v1/apps/${name}/files/`, '');

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }

    if (typeof body.content !== 'string') {
      throw new BadRequestError('Request body must include a "content" field (string)');
    }

    // Check existence before upsert to determine created vs updated
    const db = workspace.getPlatformDb();
    const existing = db.query(
      'SELECT 1 FROM app_files WHERE app_name = ? AND path = ?',
    ).get(name, filePath);

    const result = manager.updateFile(name, filePath, body.content);
    const status = existing ? 'updated' : 'created';
    return c.json({ data: { ...result, status } });
  });

  // DELETE /apps/:name - Delete an app
  app.delete('/apps/:name', (c) => {
    const name = c.req.param('name')!;
    manager.delete(name);
    return c.json({ data: { message: `App '${name}' deleted` } });
  });

  return app;
}
