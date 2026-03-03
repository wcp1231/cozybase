import { Hono } from 'hono';
import type { Workspace } from '../../core/workspace';
import type { AppManager } from './manager';
import { BadRequestError } from '../../core/errors';

export function createAppRoutes(workspace: Workspace, manager: AppManager) {
  const app = new Hono();

  // GET /apps - List all apps with derived states
  app.get('/apps', (c) => {
    const mode = c.req.query('mode');
    if (mode !== undefined && mode !== 'stable' && mode !== 'draft') {
      throw new BadRequestError('Query parameter "mode" must be "stable" or "draft"');
    }

    const apps = manager.list(mode);
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

    // Accept either "slug" or "name" for the app identifier
    const slug = typeof body.slug === 'string' ? body.slug.trim()
      : typeof body.name === 'string' ? body.name.trim()
      : '';

    if (!slug) {
      throw new BadRequestError('Request body must include a non-empty "slug" (or "name") field');
    }

    const description = typeof body.description === 'string' ? body.description : '';
    const displayName = typeof body.display_name === 'string' ? body.display_name : '';
    const result = await manager.create(slug, description, displayName);
    const data: Record<string, unknown> = { ...result.app, api_key: result.apiKey };
    if (result.reconcileError) {
      data.reconcileError = result.reconcileError;
    }
    return c.json({ data }, 201);
  });

  // GET /apps/:slug - Get single app with files
  app.get('/apps/:slug', (c) => {
    const slug = c.req.param('slug')!;
    const appWithFiles = manager.getAppWithFiles(slug);
    return c.json({ data: appWithFiles });
  });

  // PUT /apps/:slug - Whole-app update (optimistic lock)
  app.put('/apps/:slug', async (c) => {
    const slug = c.req.param('slug')!;

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
      slug,
      body.files as { path: string; content: string }[],
      body.base_version,
    );
    return c.json({ data: result });
  });

  // PUT /apps/:slug/files/* - Single file update
  app.put('/apps/:slug/files/*', async (c) => {
    const slug = c.req.param('slug')!;
    const filePath = c.req.path.replace(`/api/v1/apps/${slug}/files/`, '');

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
      'SELECT 1 FROM app_files WHERE app_slug = ? AND path = ?',
    ).get(slug, filePath);

    const result = manager.updateFile(slug, filePath, body.content);
    const status = existing ? 'updated' : 'created';
    return c.json({ data: { ...result, status } });
  });

  // DELETE /apps/:slug - Delete an app
  app.delete('/apps/:slug', (c) => {
    const slug = c.req.param('slug')!;
    manager.delete(slug);
    return c.json({ data: { message: `App '${slug}' deleted` } });
  });

  app.post('/apps/:slug/start', (c) => {
    const slug = c.req.param('slug')!;
    const result = manager.startStable(slug);
    return c.json({ data: result });
  });

  app.post('/apps/:slug/stop', (c) => {
    const slug = c.req.param('slug')!;
    const result = manager.stopStable(slug);
    return c.json({ data: result });
  });

  app.post('/apps/:slug/rename', async (c) => {
    const slug = c.req.param('slug')!;

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }

    const newSlug = typeof body.new_slug === 'string'
      ? body.new_slug.trim()
      : typeof body.new_name === 'string'
        ? body.new_name.trim()
        : '';

    if (!newSlug) {
      throw new BadRequestError('Request body must include a non-empty "new_slug" field');
    }

    const result = manager.rename(slug, newSlug);
    return c.json({ data: result });
  });

  return app;
}
