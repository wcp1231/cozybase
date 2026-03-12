import { describe, expect, test } from 'bun:test';
import { validatePagesJson } from '@cozybase/ui';

import { createDefaultComponent } from './component-defaults';

describe('component-defaults', () => {
  test('creates valid defaults for representative component types', () => {
    const doc = {
      pages: [
        {
          path: 'home',
          title: 'Home',
          body: [
            createDefaultComponent('text'),
            createDefaultComponent('markdown'),
            createDefaultComponent('button'),
            createDefaultComponent('row'),
            createDefaultComponent('list'),
          ],
        },
      ],
    };

    const result = validatePagesJson(doc);
    expect(result.ok).toBe(true);
  });
});
