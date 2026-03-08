// Register all built-in components (side-effect)
import './components';

export { SchemaRenderer } from './renderer';
export type { SchemaRendererProps } from './renderer';
export { resolveExpression, resolveExpressions, resolveStyleExpressions } from './engine/expression';
export type * from './schema/types';
export * from './schema/validate';
export * from './schema/normalize';
export * from './schema/id';
export * from './schema/categories';
export * from './schema/tree-utils';
export * from './schema/schema-map';
export * from './theme';
export * from './primitives';
