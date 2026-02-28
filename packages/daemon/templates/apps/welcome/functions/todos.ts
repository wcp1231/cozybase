export async function GET(ctx) {
  const url = new URL(ctx.req.url);
  const status = url.searchParams.get('status');

  if (status === 'completed') {
    return ctx.db.query('SELECT * FROM todo WHERE completed = 1 ORDER BY created_at DESC');
  }

  if (status === 'pending') {
    return ctx.db.query('SELECT * FROM todo WHERE completed = 0 ORDER BY created_at DESC');
  }

  return ctx.db.query('SELECT * FROM todo ORDER BY created_at DESC');
}

export async function POST(ctx) {
  const body = await ctx.req.json();
  const title = body?.title?.trim?.();

  if (!title) {
    return new Response(JSON.stringify({ error: 'title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = ctx.db.run('INSERT INTO todo (title) VALUES (?)', [title]);
  const todo = ctx.db.query('SELECT * FROM todo WHERE id = ?', [result.lastInsertRowid]);

  return todo[0];
}

export async function DELETE(ctx) {
  const body = await ctx.req.json();
  const id = body?.id;

  if (id == null) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = ctx.db.query('SELECT * FROM todo WHERE id = ?', [id]);
  if (existing.length === 0) {
    return new Response(JSON.stringify({ error: 'todo not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  ctx.db.run('DELETE FROM todo WHERE id = ?', [id]);
  return { success: true, deleted: id };
}
