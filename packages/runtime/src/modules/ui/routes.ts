import { Hono } from 'hono';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { serveStatic } from 'hono/bun';
import type { RuntimeAppEnv } from '../../middleware/app-entry-resolver';

export function createUiRoutes() {
  const app = new Hono<RuntimeAppEnv>();

  // GET /ui.json - UI Schema
  app.get('/ui.json', (c) => {
    const entry = c.get('appEntry');
    const uiJsonPath = join(entry.uiDir, 'pages.json');

    if (!existsSync(uiJsonPath)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'UI definition not found' } }, 404);
    }

    const content = readFileSync(uiJsonPath, 'utf-8');
    return c.json({ data: JSON.parse(content) });
  });

  // GET /assets/* - Static assets
  app.get('/assets/*', (c) => {
    const entry = c.get('appEntry');
    const assetPath = c.req.path.replace(/^.*\/assets\//, '');
    const fullPath = join(entry.uiDir, 'assets', assetPath);

    if (!existsSync(fullPath)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404);
    }

    return new Response(Bun.file(fullPath));
  });

  // GET / - UI index.html
  app.get('/', (c) => {
    const entry = c.get('appEntry');
    const indexPath = join(entry.uiDir, 'index.html');

    if (!existsSync(indexPath)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'UI not found' } }, 404);
    }

    const content = readFileSync(indexPath, 'utf-8');
    return c.html(content);
  });

  return app;
}
