import { describe, expect, test } from 'bun:test';
import { TOOL_DESCRIPTIONS } from '../../src/modules/apps/mcp-types';

describe('TOOL_DESCRIPTIONS.get_guide', () => {
  test('lists newer guide topics', () => {
    expect(TOOL_DESCRIPTIONS.get_guide).toContain('scheduled-tasks');
    expect(TOOL_DESCRIPTIONS.get_guide).toContain('ui/batch');
  });
});
