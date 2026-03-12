import type { Database } from 'bun:sqlite';
import type { DatabaseClient } from './types';

export class SqliteDatabaseClient implements DatabaseClient {
  constructor(private db: Database) {}

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.query(sql);
    return (params ? stmt.all(...(params as any[])) : stmt.all()) as T[];
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    const stmt = this.db.query(sql);
    const result = params ? stmt.run(...(params as any[])) : stmt.run();
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }
}
