import type { Database } from 'bun:sqlite';

export function introspectSchema(db: Database): Record<string, any> {
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];

  const schema: Record<string, any> = {};

  for (const { name } of tables) {
    const columns = db.query(`PRAGMA table_info('${name}')`).all();
    const foreignKeys = db.query(`PRAGMA foreign_key_list('${name}')`).all();
    const indexes = db.query(`PRAGMA index_list('${name}')`).all();
    schema[name] = { columns, foreignKeys, indexes };
  }

  return schema;
}
