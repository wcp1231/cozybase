import type { ExpressionContext } from '../schema/types';

type ComparisonOperator = '===' | '!==' | '>' | '>=' | '<' | '<=';

type Token =
  | { type: 'path'; value: string }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'undefined' }
  | { type: 'operator'; value: ComparisonOperator | '?' | ':' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'eof' };

type ExpressionNode =
  | { type: 'path'; value: string }
  | { type: 'literal'; value: string | number | boolean | null | undefined }
  | {
      type: 'binary';
      operator: ComparisonOperator;
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | {
      type: 'conditional';
      condition: ExpressionNode;
      whenTrue: ExpressionNode;
      whenFalse: ExpressionNode;
    };

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

export function resolveStyleExpressions(
  style: Record<string, unknown> | undefined,
  context: ExpressionContext,
): Record<string, string | number> | undefined {
  if (!style) return undefined;

  const resolved = resolveExpressions(style, context);
  const result: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(resolved)) {
    if (value === undefined || value === null) continue;
    result[key] = typeof value === 'number' ? value : String(value);
  }

  return result;
}

// ---- Internal evaluator ----

function evaluateExpression(expr: string, ctx: ExpressionContext): unknown {
  try {
    const tokens = tokenize(expr);
    const parser = new ExpressionParser(tokens);
    const ast = parser.parse();
    return evaluateAst(ast, ctx);
  } catch {
    return undefined;
  }
}

function evaluateAst(node: ExpressionNode, ctx: ExpressionContext): unknown {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'path':
      return resolvePath(node.value, ctx);
    case 'binary': {
      const left = evaluateAst(node.left, ctx);
      const right = evaluateAst(node.right, ctx);
      switch (node.operator) {
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '>':
          return compareValues(left, right, (a, b) => a > b);
        case '>=':
          return compareValues(left, right, (a, b) => a >= b);
        case '<':
          return compareValues(left, right, (a, b) => a < b);
        case '<=':
          return compareValues(left, right, (a, b) => a <= b);
      }
      break;
    }
    case 'conditional':
      return evaluateAst(node.condition, ctx)
        ? evaluateAst(node.whenTrue, ctx)
        : evaluateAst(node.whenFalse, ctx);
  }
}

function compareValues(
  left: unknown,
  right: unknown,
  comparator: (left: number | string, right: number | string) => boolean,
): boolean {
  if (
    (typeof left === 'number' && typeof right === 'number') ||
    (typeof left === 'string' && typeof right === 'string')
  ) {
    return comparator(left, right);
  }
  return false;
}

class ExpressionParser {
  private current = 0;

  constructor(private tokens: Token[]) {}

  parse(): ExpressionNode {
    const expression = this.parseConditional();
    this.expect('eof');
    return expression;
  }

  private parseConditional(): ExpressionNode {
    const condition = this.parseComparison();

    if (!this.matchOperator('?')) {
      return condition;
    }

    const whenTrue = this.parseConditional();
    this.expectOperator(':');
    const whenFalse = this.parseConditional();

    return {
      type: 'conditional',
      condition,
      whenTrue,
      whenFalse,
    };
  }

  private parseComparison(): ExpressionNode {
    let left = this.parsePrimary();

    while (true) {
      const operator = this.matchComparisonOperator();
      if (!operator) {
        return left;
      }

      const right = this.parsePrimary();
      left = {
        type: 'binary',
        operator,
        left,
        right,
      };
    }
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    switch (token.type) {
      case 'paren':
        if (token.value === '(') {
          this.advance();
          const expression = this.parseConditional();
          this.expectParen(')');
          return expression;
        }
        break;
      case 'path':
        this.advance();
        return { type: 'path', value: token.value };
      case 'string':
      case 'number':
      case 'boolean':
        this.advance();
        return { type: 'literal', value: token.value };
      case 'null':
        this.advance();
        return { type: 'literal', value: null };
      case 'undefined':
        this.advance();
        return { type: 'literal', value: undefined };
    }

    throw new Error(`Unexpected token: ${describeToken(token)}`);
  }

  private matchComparisonOperator(): ComparisonOperator | null {
    const token = this.peek();
    if (
      token.type === 'operator' &&
      ['===', '!==', '>', '>=', '<', '<='].includes(token.value)
    ) {
      this.advance();
      return token.value as ComparisonOperator;
    }
    return null;
  }

  private matchOperator(value: '?' | ':'): boolean {
    const token = this.peek();
    if (token.type === 'operator' && token.value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectOperator(value: '?' | ':'): void {
    if (!this.matchOperator(value)) {
      throw new Error(`Expected operator ${value}`);
    }
  }

  private expectParen(value: '(' | ')'): void {
    const token = this.peek();
    if (token.type !== 'paren' || token.value !== value) {
      throw new Error(`Expected parenthesis ${value}`);
    }
    this.advance();
  }

  private expect(type: Token['type']): void {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected token ${type}, got ${describeToken(token)}`);
    }
  }

  private peek(): Token {
    return this.tokens[this.current] ?? { type: 'eof' };
  }

  private advance(): Token {
    const token = this.peek();
    this.current += 1;
    return token;
  }
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expr.length) {
    const char = expr[index];

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    const comparisonOperator = matchComparisonOperator(expr, index);
    if (comparisonOperator) {
      tokens.push({ type: 'operator', value: comparisonOperator });
      index += comparisonOperator.length;
      continue;
    }

    if (char === '?' || char === ':') {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"') {
      const { value, nextIndex } = readString(expr, index);
      tokens.push({ type: 'string', value });
      index = nextIndex;
      continue;
    }

    if (isNumberStart(expr, index)) {
      const { value, nextIndex } = readNumber(expr, index);
      tokens.push({ type: 'number', value });
      index = nextIndex;
      continue;
    }

    if (isIdentifierStart(char)) {
      const { value, nextIndex } = readPath(expr, index);
      switch (value) {
        case 'true':
          tokens.push({ type: 'boolean', value: true });
          break;
        case 'false':
          tokens.push({ type: 'boolean', value: false });
          break;
        case 'null':
          tokens.push({ type: 'null' });
          break;
        case 'undefined':
          tokens.push({ type: 'undefined' });
          break;
        default:
          tokens.push({ type: 'path', value });
      }
      index = nextIndex;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

function matchComparisonOperator(
  expr: string,
  index: number,
): ComparisonOperator | null {
  for (const operator of ['===', '!==', '>=', '<=', '>', '<'] as const) {
    if (expr.startsWith(operator, index)) {
      return operator;
    }
  }
  return null;
}

function readString(
  expr: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  const quote = expr[startIndex];
  let index = startIndex + 1;
  let value = '';

  while (index < expr.length) {
    const char = expr[index];

    if (char === '\\') {
      const nextChar = expr[index + 1];
      if (nextChar === undefined) {
        break;
      }
      value += nextChar;
      index += 2;
      continue;
    }

    if (char === quote) {
      return { value, nextIndex: index + 1 };
    }

    value += char;
    index += 1;
  }

  throw new Error('Unterminated string literal');
}

function readNumber(
  expr: string,
  startIndex: number,
): { value: number; nextIndex: number } {
  let index = startIndex;

  if (expr[index] === '-') {
    index += 1;
  }

  while (index < expr.length && isDigit(expr[index])) {
    index += 1;
  }

  if (expr[index] === '.') {
    index += 1;
    while (index < expr.length && isDigit(expr[index])) {
      index += 1;
    }
  }

  return {
    value: Number(expr.slice(startIndex, index)),
    nextIndex: index,
  };
}

function readPath(
  expr: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  let index = startIndex;

  while (index < expr.length) {
    const char = expr[index];
    if (isPathCharacter(char)) {
      index += 1;
      continue;
    }

    break;
  }

  return {
    value: expr.slice(startIndex, index),
    nextIndex: index,
  };
}

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && /[0-9]/.test(char);
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/.test(char);
}

function isPathCharacter(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$.-]/.test(char);
}

function isNumberStart(expr: string, index: number): boolean {
  const char = expr[index];
  const nextChar = expr[index + 1];

  if (isDigit(char)) {
    return true;
  }

  return char === '-' && isDigit(nextChar);
}

function describeToken(token: Token): string {
  switch (token.type) {
    case 'path':
    case 'string':
    case 'number':
    case 'boolean':
      return `${token.type}(${String(token.value)})`;
    case 'operator':
    case 'paren':
      return `${token.type}(${token.value})`;
    default:
      return token.type;
  }
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
