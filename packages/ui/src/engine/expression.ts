import type { ExpressionContext } from '../schema/types';

/**
 * Resolve a value that may contain ${...} expressions.
 * Returns the resolved value — a string if the input was a template,
 * or the raw value if a pure single expression.
 */
export function resolveExpression(
  input: unknown,
  context: ExpressionContext,
): unknown {
  if (typeof input !== 'string') return input;
  if (!input.includes('${')) return input;

  // Pure single expression: "${row.title}" → return raw value (not stringified)
  const pureSingleMatch = input.match(/^\$\{(.+)\}$/s);
  if (pureSingleMatch) {
    return evaluateExpression(pureSingleMatch[1].trim(), context);
  }

  // Template string: "prefix ${expr} suffix" → always returns string
  return input.replace(/\$\{(.+?)\}/g, (_, expr) => {
    const val = evaluateExpression(expr.trim(), context);
    return val === undefined || val === null ? '' : String(val);
  });
}

/**
 * Resolve all expression strings in a plain object (shallow).
 */
export function resolveExpressions(
  obj: Record<string, unknown>,
  context: ExpressionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveExpression(value, context);
  }
  return result;
}

// ---- Internal evaluator ----

function evaluateExpression(expr: string, ctx: ExpressionContext): unknown {
  // Ternary:  condition ? trueVal : falseVal
  const ternaryMatch = expr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/s);
  if (ternaryMatch) {
    const condition = evaluateExpression(ternaryMatch[1].trim(), ctx);
    return condition
      ? evaluateExpression(ternaryMatch[2].trim(), ctx)
      : evaluateExpression(ternaryMatch[3].trim(), ctx);
  }

  // Comparison: a === b  or  a !== b
  const eqMatch = expr.match(/^(.+?)\s*(===|!==)\s*(.+)$/);
  if (eqMatch) {
    const left = evaluateExpression(eqMatch[1].trim(), ctx);
    const right = evaluateExpression(eqMatch[3].trim(), ctx);
    return eqMatch[2] === '===' ? left === right : left !== right;
  }

  // String literal: 'hello' or "hello"
  const strMatch = expr.match(/^['"](.*)['"]$/);
  if (strMatch) {
    return strMatch[1];
  }

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return Number(expr);
  }

  // Boolean literal
  if (expr === 'true') return true;
  if (expr === 'false') return false;

  // null / undefined
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;

  // Property path: row.title, response.meta.total, etc.
  return resolvePath(expr, ctx);
}

function resolvePath(path: string, ctx: ExpressionContext): unknown {
  const parts = path.split('.');
  const root = parts[0];
  const rest = parts.slice(1);

  let value: unknown;

  // Map root scope to context
  if (root === 'row') {
    value = ctx.row;
  } else if (root === 'form') {
    value = ctx.form;
  } else if (root === 'params') {
    value = ctx.params;
  } else if (root === 'response') {
    value = ctx.response;
    // For "response.xxx", walk from response
    return walkPath(value, rest);
  } else if (root === 'props') {
    value = ctx.props;
  } else {
    // Assume it's a component id: "componentId.value" or "componentId.data"
    const compState = ctx.components?.[root];
    if (!compState) return undefined;
    if (rest.length === 0) return compState;
    const prop = rest[0];
    if (prop === 'value') {
      value = compState.value;
      return rest.length > 1 ? walkPath(value, rest.slice(1)) : value;
    }
    if (prop === 'data') {
      value = compState.data;
      return rest.length > 1 ? walkPath(value, rest.slice(1)) : value;
    }
    return undefined;
  }

  return walkPath(value, rest);
}

function walkPath(obj: unknown, parts: string[]): unknown {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
