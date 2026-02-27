import { Hono } from 'hono';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { RuntimeAppEnv } from '../../middleware/app-entry-resolver';
import type { AppRegistry } from '../../registry';

export function createUiRoutes(registry: AppRegistry) {
  const app = new Hono<RuntimeAppEnv>();

  // GET /ui - UI definition (pages.json)
  app.get('/ui', (c) => {
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

  // GET / - UI index.html with theme CSS injected
  app.get('/', (c) => {
    const entry = c.get('appEntry');
    const indexPath = join(entry.uiDir, 'index.html');

    if (!existsSync(indexPath)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'UI not found' } }, 404);
    }

    let html = readFileSync(indexPath, 'utf-8');
    const themeCSS = registry.getThemeCSS();
    if (themeCSS && html.includes('</head>')) {
      // Escape </style sequences to prevent breaking out of the style tag
      const safeCSS = themeCSS.replace(/<\/style/gi, '<\\/style');
      html = html.replace('</head>', `<style id="cz-theme">${safeCSS}</style>\n</head>`);
    }
    return c.html(html);
  });

  return app;
}
