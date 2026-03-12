import { describe, expect, test } from 'bun:test';
import { TOOL_DESCRIPTIONS } from '../../src/modules/apps/mcp-types';

describe('TOOL_DESCRIPTIONS.get_guide', () => {
  test('lists newer guide topics', () => {
    expect(TOOL_DESCRIPTIONS.get_guide).toContain('scheduled-tasks');
    expect(TOOL_DESCRIPTIONS.get_guide).toContain('ui/batch');
  });
});

describe('TOOL_DESCRIPTIONS.ui_batch', () => {
  test('describes current page path fields and ref constraints', () => {
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('array of operation objects');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('op` as the discriminator');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('page_add: { path, title, index? }');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('page_remove: { page_path }');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('page_update: { page_path, title }');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('future refs and same-operation self references do not');
    expect(TOOL_DESCRIPTIONS.ui_batch).toContain('include `children: []`');
    expect(TOOL_DESCRIPTIONS.ui_batch).not.toContain('page_add: { id, title, index? }');
    expect(TOOL_DESCRIPTIONS.ui_batch).not.toContain('page_remove: { page_id }');
    expect(TOOL_DESCRIPTIONS.ui_batch).not.toContain('page_update: { page_id, title }');
  });
});
