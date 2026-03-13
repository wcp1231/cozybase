import type { FunctionContext } from 'cozybase';

type ToggleRequest = {
  id?: string;
  completed?: number | string | boolean | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeCompleted(value: ToggleRequest['completed']) {
  if (value === 1 || value === '1' || value === true) return 1;
  if (value === 0 || value === '0' || value === false) return 0;
  return null;
}

export async function PATCH(ctx: FunctionContext) {
  if (!ctx.req) {
    return json({ error: 'HTTP request is required' }, 400);
  }

  const url = new URL(ctx.req.url);

  let body: ToggleRequest = {};
  try {
    body = (await ctx.req.json()) as ToggleRequest;
  } catch {
    body = {};
  }

  const id = body?.id?.trim?.() || url.searchParams.get('id')?.trim() || '';
  const completed = normalizeCompleted(
    body?.completed ?? url.searchParams.get('completed'),
  );

  if (!id) {
    return json({ error: 'id is required' }, 400);
  }

  if (completed == null) {
    return json({ error: 'completed must be 0 or 1' }, 400);
  }

  const result = ctx.db.run(
    `
      UPDATE tasks
      SET
        completed = ?,
        completed_at = CASE
          WHEN ? = 1 THEN datetime('now', 'localtime')
          ELSE NULL
        END
      WHERE id = ?
    `,
    [completed, completed, id],
  );

  if (result.changes === 0) {
    return json({ error: 'task not found' }, 404);
  }

  const [task] = ctx.db.query(
    'SELECT * FROM tasks WHERE id = ?',
    [id],
  );

  return task;
}
