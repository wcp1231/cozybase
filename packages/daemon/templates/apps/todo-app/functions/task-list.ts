import type { FunctionContext } from 'cozybase';

type TaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  priority: number;
  description: string | null;
  completed: number;
  created_at: string;
  completed_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildWhereClause(status: string) {
  switch (status) {
    case 'in_progress':
      return {
        clause: 'WHERE completed = 0',
        params: [] as unknown[],
      };
    case 'completed':
      return {
        clause: 'WHERE completed = 1',
        params: [] as unknown[],
      };
    case 'all':
    case '':
      return {
        clause: '',
        params: [] as unknown[],
      };
    default:
      return null;
  }
}

export function GET(ctx: FunctionContext) {
  if (!ctx.req) {
    return json({ error: 'HTTP request is required' }, 400);
  }

  const url = new URL(ctx.req.url);
  const status = url.searchParams.get('status')?.trim() || 'all';
  const where = buildWhereClause(status);

  if (!where) {
    return json(
      { error: 'status must be one of: all, in_progress, completed' },
      400,
    );
  }

  const rows = ctx.db.query<TaskRow>(
    `
      SELECT
        id,
        title,
        due_date,
        priority,
        description,
        completed,
        created_at,
        completed_at
      FROM tasks
      ${where.clause}
      ORDER BY
        due_date ASC,
        priority DESC,
        created_at DESC
    `,
    where.params,
  );

  return { data: rows };
}
