import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createRecordAction } from '../../../operator-agent/src/tools/create-record';
import { toZodRawShapeFromSchema } from '../../src/ai/operator/schema-to-zod';

describe('operator schema-to-zod', () => {
  test('preserves dynamic record fields for create_record MCP input', () => {
    const schema = z.object(
      toZodRawShapeFromSchema(createRecordAction.schema as unknown as Record<string, unknown>),
    );

    const parsed = schema.parse({
      table: 'todo',
      data: {
        title: '测试 create_record',
        completed: 0,
        created_at: '2026-03-10 00:00:00',
      },
    });

    expect(parsed).toEqual({
      table: 'todo',
      data: {
        title: '测试 create_record',
        completed: 0,
        created_at: '2026-03-10 00:00:00',
      },
    });
  });
});
