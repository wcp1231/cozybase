import { Hono } from 'hono';
import { z } from 'zod';
import type { Workspace } from '../../core/workspace';
import type { AppRegistry } from '@cozybase/runtime';
import { generateThemeCSS } from '@cozybase/ui';

// Strict CSS value pattern: disallow characters that could break out of CSS/HTML context
const safeCSSValue = z.string().regex(
  /^[^{}<>]*$/,
  'Value must not contain <, >, {, or } characters',
);

// Token keys must be valid CSS custom property names (alphanumeric, hyphens only)
const safeCSSKey = z.string().regex(
  /^[a-zA-Z0-9-]+$/,
  'Token key must only contain letters, numbers, and hyphens',
);

const ThemeUpdateSchema = z.object({
  mode: z.enum(['light', 'dark', 'system']).optional(),
  primaryColor: safeCSSValue.optional(),
  fontFamily: safeCSSValue.optional(),
  tokens: z.record(safeCSSKey, safeCSSValue).optional(),
});

export function createThemeRoutes(workspace: Workspace, registry: AppRegistry) {
  const app = new Hono();

  // GET /theme - return theme config
  app.get('/theme', (c) => {
    return c.json({ data: workspace.getThemeConfig() });
  });

  // GET /theme/css - return generated CSS
  app.get('/theme/css', (c) => {
    const css = generateThemeCSS(workspace.getThemeConfig());
    return new Response(css, {
      headers: { 'Content-Type': 'text/css; charset=utf-8' },
    });
  });

  // PUT /theme - update theme config
  app.put('/theme', async (c) => {
    const body = await c.req.json();
    const parsed = ThemeUpdateSchema.parse(body);

    workspace.updateThemeConfig(parsed);

    // Regenerate CSS and push to runtime registry
    const css = generateThemeCSS(workspace.getThemeConfig());
    registry.setThemeCSS(css);

    return c.json({ data: workspace.getThemeConfig() });
  });

  return app;
}
