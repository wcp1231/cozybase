import { describe, expect, test } from 'bun:test';
import type { HandlerContext } from '../../src/mcp/handlers';
import { handleGetAppConsole, handleGetAppErrors } from '../../src/mcp/handlers';

describe('MCP console tool handlers', () => {
  test('handleGetAppConsole defaults mode to stable and returns backend payload', async () => {
    const calls: Array<[string, string]> = [];
    const ctx: HandlerContext = {
      appsDir: '/tmp/apps',
      backend: {
        async getAppConsole(appName: string, mode?: string) {
          calls.push([appName, mode ?? 'stable']);
          return {
            app_status: {
              stable_running: true,
              stable_status: 'running',
              current_version: 3,
              published_version: 3,
            },
            error_summary: {
              total_24h: 2,
              by_source: { schedule: 2 },
            },
            schedules_summary: {
              total: 1,
              healthy: 0,
              failing: 1,
              failing_names: ['nightly'],
            },
          };
        },
      } as any,
    };

    const result = await handleGetAppConsole(ctx, { app_name: 'myapp' });

    expect(calls).toEqual([['myapp', 'stable']]);
    expect(result.error_summary.total_24h).toBe(2);
    expect(result.schedules_summary.failing_names).toEqual(['nightly']);
  });

  test('handleGetAppErrors forwards filters and pagination', async () => {
    const calls: Array<[string, string, number, number, string | undefined]> = [];
    const ctx: HandlerContext = {
      appsDir: '/tmp/apps',
      backend: {
        async getAppErrors(
          appName: string,
          mode?: string,
          limit?: number,
          offset?: number,
          sourceType?: string,
        ) {
          calls.push([appName, mode ?? 'stable', limit ?? 10, offset ?? 0, sourceType]);
          return {
            errors: [
              {
                source_type: 'schedule',
                source_detail: 'schedule:nightly',
                error_code: 'SCHEDULE_ERROR',
                error_message: 'nightly failed',
                stack_trace: null,
                occurrence_count: 1,
                created_at: '2026-03-06T00:00:00.000Z',
                updated_at: '2026-03-06T00:00:00.000Z',
              },
            ],
          };
        },
      } as any,
    };

    const result = await handleGetAppErrors(ctx, {
      app_name: 'myapp',
      mode: 'draft',
      limit: 25,
      offset: 5,
      source_type: 'schedule',
    });

    expect(calls).toEqual([['myapp', 'draft', 25, 5, 'schedule']]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source_type).toBe('schedule');
  });
});
