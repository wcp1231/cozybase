import type { ComponentType } from 'react';
import type { ComponentSchema, CustomComponentSchema, ExpressionContext } from '../schema/types';

export type SchemaComponentProps = {
  schema: ComponentSchema;
  exprContext: ExpressionContext;
  renderChild: (schema: ComponentSchema, key?: string | number) => React.ReactNode;
};

type RegisteredComponent = ComponentType<SchemaComponentProps>;

const builtinRegistry = new Map<string, RegisteredComponent>();

export function registerBuiltinComponent(
  type: string,
  component: RegisteredComponent,
): void {
  builtinRegistry.set(type, component);
}

export function getComponent(
  type: string,
  customComponents?: Record<string, CustomComponentSchema>,
): RegisteredComponent | null {
  // 1. Built-in component
  const builtin = builtinRegistry.get(type);
  if (builtin) return builtin;

  // 2. Custom component (handled by the renderer via template expansion)
  if (customComponents && type in customComponents) {
    return null; // Signal to renderer to expand the template
  }

  // 3. Unknown
  return null;
}

export function isBuiltinType(type: string): boolean {
  return builtinRegistry.has(type);
}

export function isCustomType(
  type: string,
  customComponents?: Record<string, CustomComponentSchema>,
): boolean {
  return !builtinRegistry.has(type) && !!customComponents && type in customComponents;
}

export { builtinRegistry };
