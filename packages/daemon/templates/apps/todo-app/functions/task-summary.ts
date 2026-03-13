import type { FunctionContext } from 'cozybase';

type SummaryRow = {
  total_count: number;
  pending_count: number;
  completed_count: number;
  overdue_count: number;
};

export function GET(ctx: FunctionContext) {
  const [row] = ctx.db.query<SummaryRow>(
    `
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_count,
        SUM(
          CASE
            WHEN completed = 0
             AND due_date IS NOT NULL
             AND due_date < date('now', 'localtime')
            THEN 1
            ELSE 0
          END
        ) AS overdue_count
      FROM tasks
    `,
  );

  return {
    data: [
      {
        total_count: Number(row?.total_count ?? 0),
        pending_count: Number(row?.pending_count ?? 0),
        completed_count: Number(row?.completed_count ?? 0),
        overdue_count: Number(row?.overdue_count ?? 0),
      },
    ],
  };
}
