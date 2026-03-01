import { describe, test, expect } from 'bun:test';
import {
  resolveExpression,
  resolveExpressions,
  resolveStyleExpressions,
} from '../expression';
import type { ExpressionContext } from '../../schema/types';

describe('resolveExpression', () => {
  // ---- Property access ----

  test('resolves simple row property access', () => {
    const ctx: ExpressionContext = { row: { title: 'Hello World' } };
    expect(resolveExpression('${row.title}', ctx)).toBe('Hello World');
  });

  test('resolves nested property access via response', () => {
    const ctx: ExpressionContext = { response: { meta: { total: 42 } } };
    expect(resolveExpression('${response.meta.total}', ctx)).toBe(42);
  });

  test('resolves row.id in a string template', () => {
    const ctx: ExpressionContext = { row: { id: 7 } };
    expect(resolveExpression('/db/todo/${row.id}', ctx)).toBe('/db/todo/7');
  });

  // ---- Comparison operators ----

  test('resolves === comparison to true', () => {
    const ctx: ExpressionContext = { row: { completed: 1 } };
    expect(resolveExpression('${row.completed === 1}', ctx)).toBe(true);
  });

  test('resolves === comparison to false', () => {
    const ctx: ExpressionContext = { row: { completed: 0 } };
    expect(resolveExpression('${row.completed === 1}', ctx)).toBe(false);
  });

  test('resolves !== comparison to true', () => {
    const ctx: ExpressionContext = { row: { completed: 0 } };
    expect(resolveExpression('${row.completed !== 1}', ctx)).toBe(true);
  });

  test('resolves !== comparison to false', () => {
    const ctx: ExpressionContext = { row: { completed: 1 } };
    expect(resolveExpression('${row.completed !== 1}', ctx)).toBe(false);
  });

  // ---- Ternary ----

  test('resolves ternary — true branch', () => {
    const ctx: ExpressionContext = { row: { completed: 1 } };
    const result = resolveExpression(
      "${row.completed === 1 ? 'Done' : 'Pending'}",
      ctx,
    );
    expect(result).toBe('Done');
  });

  test('resolves ternary — false branch', () => {
    const ctx: ExpressionContext = { row: { completed: 0 } };
    const result = resolveExpression(
      "${row.completed === 1 ? 'Done' : 'Pending'}",
      ctx,
    );
    expect(result).toBe('Pending');
  });

  test('resolves nested ternary expressions', () => {
    const ctx: ExpressionContext = { row: { status: 'not_allergic' } };
    const result = resolveExpression(
      "${row.status === 'allergic' ? '#ff4d4f' : row.status === 'not_allergic' ? '#52c41a' : '#ffffff'}",
      ctx,
    );
    expect(result).toBe('#52c41a');
  });

  test('resolves grouped nested ternary expressions with parentheses', () => {
    const ctx: ExpressionContext = {
      row: { status: 'allergic', severity: 'moderate' },
    };
    const result = resolveExpression(
      "${row.status === 'not_allergic' ? '#52c41a' : row.status === 'allergic' ? (row.severity === 'mild' ? '#faad14' : row.severity === 'moderate' ? '#fa541c' : '#cf1322') : '#ffffff'}",
      ctx,
    );
    expect(result).toBe('#fa541c');
  });

  test('resolves parenthesized conditions', () => {
    const ctx: ExpressionContext = { row: { completed: 1 } };
    const result = resolveExpression(
      "${(row.completed === 1) ? 'Done' : 'Pending'}",
      ctx,
    );
    expect(result).toBe('Done');
  });

  test('resolves relational comparisons in ternary expressions', () => {
    const ctx: ExpressionContext = { row: { score: 72 } };
    const result = resolveExpression(
      "${row.score >= 60 ? 'Pass' : 'Fail'}",
      ctx,
    );
    expect(result).toBe('Pass');
  });

  // ---- Non-existent path ----

  test('returns undefined for non-existent context root', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('${nonexistent.value}', ctx)).toBeUndefined();
  });

  test('returns undefined for non-existent nested path on row', () => {
    const ctx: ExpressionContext = { row: { a: 1 } };
    expect(resolveExpression('${row.b.c}', ctx)).toBeUndefined();
  });

  // ---- Component state ----

  test('resolves component state value', () => {
    const ctx: ExpressionContext = {
      components: {
        myComp: { value: 'search-term' },
      },
    };
    expect(resolveExpression('${myComp.value}', ctx)).toBe('search-term');
  });

  test('resolves component state data', () => {
    const ctx: ExpressionContext = {
      components: {
        myTable: { data: [1, 2, 3] },
      },
    };
    expect(resolveExpression('${myTable.data}', ctx)).toEqual([1, 2, 3]);
  });

  test('returns undefined for unknown component', () => {
    const ctx: ExpressionContext = { components: {} };
    expect(resolveExpression('${unknown.value}', ctx)).toBeUndefined();
  });

  // ---- Non-string input passthrough ----

  test('returns number input unchanged', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression(42, ctx)).toBe(42);
  });

  test('returns boolean input unchanged', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression(true, ctx)).toBe(true);
    expect(resolveExpression(false, ctx)).toBe(false);
  });

  test('returns null unchanged', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression(null, ctx)).toBeNull();
  });

  test('returns undefined unchanged', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression(undefined, ctx)).toBeUndefined();
  });

  test('returns object unchanged', () => {
    const obj = { key: 'value' };
    const ctx: ExpressionContext = {};
    expect(resolveExpression(obj, ctx)).toBe(obj);
  });

  // ---- Pure expression returns typed value ----

  test('pure expression returns number, not string', () => {
    const ctx: ExpressionContext = { row: { count: 99 } };
    expect(resolveExpression('${row.count}', ctx)).toBe(99);
    expect(typeof resolveExpression('${row.count}', ctx)).toBe('number');
  });

  test('pure expression returns boolean, not string', () => {
    const ctx: ExpressionContext = { row: { active: true } };
    expect(resolveExpression('${row.active}', ctx)).toBe(true);
    expect(typeof resolveExpression('${row.active}', ctx)).toBe('boolean');
  });

  // ---- String with no expressions ----

  test('returns plain string as-is when no expressions present', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('plain text', ctx)).toBe('plain text');
  });

  test('returns empty string as-is', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('', ctx)).toBe('');
  });

  // ---- Literal evaluation inside expressions ----

  test('resolves string literal inside expression', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression("${'hello'}", ctx)).toBe('hello');
  });

  test('resolves number literal inside expression', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('${42}', ctx)).toBe(42);
  });

  test('resolves boolean literals inside expression', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('${true}', ctx)).toBe(true);
    expect(resolveExpression('${false}', ctx)).toBe(false);
  });

  test('resolves null literal inside expression', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('${null}', ctx)).toBeNull();
  });

  test('resolves undefined literal inside expression', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('${undefined}', ctx)).toBeUndefined();
  });

  // ---- Template with undefined values ----

  test('template replaces undefined values with empty string', () => {
    const ctx: ExpressionContext = { row: { id: 5 } };
    expect(resolveExpression('Hello ${row.name}!', ctx)).toBe('Hello !');
  });

  test('template replaces null values with empty string', () => {
    const ctx: ExpressionContext = { row: { name: null } };
    expect(resolveExpression('Hello ${row.name}!', ctx)).toBe('Hello !');
  });

  // ---- Multiple expressions in one template ----

  test('resolves multiple expressions in a single template string', () => {
    const ctx: ExpressionContext = {
      row: { first: 'John', last: 'Doe' },
    };
    // Template must not start with ${ and end with } to avoid the pure-single-expression regex
    expect(resolveExpression('Name: ${row.first} ${row.last}!', ctx)).toBe(
      'Name: John Doe!',
    );
  });

  // ---- Form and params context ----

  test('resolves form context values', () => {
    const ctx: ExpressionContext = { form: { email: 'a@b.com' } };
    expect(resolveExpression('${form.email}', ctx)).toBe('a@b.com');
  });

  test('resolves params context values', () => {
    const ctx: ExpressionContext = { params: { id: '123' } };
    expect(resolveExpression('${params.id}', ctx)).toBe('123');
  });

  test('resolves params embedded in template string', () => {
    const ctx: ExpressionContext = { params: { baby_id: '42' } };
    expect(resolveExpression('id.eq.${params.baby_id}', ctx)).toBe('id.eq.42');
  });

  test('returns undefined for missing params property', () => {
    const ctx: ExpressionContext = { params: { a: '1' } };
    expect(resolveExpression('${params.missing}', ctx)).toBeUndefined();
  });

  test('resolves params in template with undefined to empty', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpression('id.eq.${params.baby_id}', ctx)).toBe('id.eq.');
  });

  test('resolves props context values', () => {
    const ctx: ExpressionContext = { props: { color: 'red' } };
    expect(resolveExpression('${props.color}', ctx)).toBe('red');
  });
});

describe('resolveExpressions', () => {
  test('resolves all values in a plain object', () => {
    const ctx: ExpressionContext = { row: { id: 1, name: 'Test' } };
    const result = resolveExpressions(
      {
        title: '${row.name}',
        url: '/api/items/${row.id}',
        count: 10,
      },
      ctx,
    );
    expect(result).toEqual({
      title: 'Test',
      url: '/api/items/1',
      count: 10,
    });
  });

  test('handles empty object', () => {
    const ctx: ExpressionContext = {};
    expect(resolveExpressions({}, ctx)).toEqual({});
  });
});

describe('resolveStyleExpressions', () => {
  test('resolves style object values and preserves numeric outputs', () => {
    const ctx: ExpressionContext = { row: { status: 'allergic', opacity: 0.6 } };
    expect(
      resolveStyleExpressions(
        {
          backgroundColor:
            "${row.status === 'allergic' ? '#ff4d4f' : '#ffffff'}",
          opacity: '${row.opacity}',
        },
        ctx,
      ),
    ).toEqual({
      backgroundColor: '#ff4d4f',
      opacity: 0.6,
    });
  });
});
