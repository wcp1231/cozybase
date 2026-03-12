import type { ComponentSchema, FormComponent, HeadingComponent, ButtonComponent } from './schema/types';
import { isBuiltinComponentType } from './schema/zod';

type SchemaStyle = Record<string, string | number>;
type DefaultPatch = {
  className?: string;
  style?: SchemaStyle;
  [key: string]: unknown;
};

function joinClassNames(...parts: Array<string | undefined>): string | undefined {
  const value = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return value || undefined;
}

function stylesEqual(a?: SchemaStyle, b?: SchemaStyle): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function mergeSchemaStyle(
  defaultStyle?: SchemaStyle,
  explicitStyle?: SchemaStyle,
): SchemaStyle | undefined {
  if (!defaultStyle && !explicitStyle) return undefined;
  return {
    ...(defaultStyle ?? {}),
    ...(explicitStyle ?? {}),
  };
}

export function mergeSchemaClassName(
  defaultClassName?: string,
  explicitClassName?: string,
): string | undefined {
  return joinClassNames(defaultClassName, explicitClassName);
}

function headingStyle(level: number): SchemaStyle {
  switch (level) {
    case 1:
      return {
        color: 'var(--cz-text)',
        fontSize: 36,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        margin: 0,
      };
    case 2:
      return {
        color: 'var(--cz-text)',
        fontSize: 30,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: '-0.02em',
        margin: 0,
      };
    case 3:
      return {
        color: 'var(--cz-text)',
        fontSize: 24,
        fontWeight: 650,
        lineHeight: 1.25,
        margin: 0,
      };
    case 4:
      return {
        color: 'var(--cz-text)',
        fontSize: 20,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: 0,
      };
    case 5:
      return {
        color: 'var(--cz-text)',
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.35,
        margin: 0,
      };
    default:
      return {
        color: 'var(--cz-text-secondary)',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
        margin: 0,
      };
  }
}

function formStyle(schema: FormComponent): SchemaStyle {
  const padding = schema.layout === 'inline' ? 12 : 16;
  return {
    padding,
    border: '1px solid var(--cz-border)',
    borderRadius: 'var(--cz-radius-md)',
    backgroundColor: 'var(--cz-bg-subtle)',
    boxShadow: 'var(--cz-shadow-sm)',
  };
}

function buttonStyle(schema: ButtonComponent): SchemaStyle | undefined {
  if (schema.variant === 'ghost') return undefined;
  return {
    boxShadow: 'var(--cz-shadow-sm)',
  };
}

function getDefaultPatch(schema: ComponentSchema): DefaultPatch | null {
  if (!isBuiltinComponentType(schema.type)) return null;

  switch (schema.type) {
    case 'page':
      return {
        style: {
          width: '100%',
          maxWidth: 1120,
          margin: '0 auto',
          padding: 24,
          boxSizing: 'border-box',
          gap: 24,
        },
      };
    case 'row':
      return { gap: 12 };
    case 'col':
      return { gap: 12 };
    case 'card':
      return { padding: 20 };
    case 'tabs':
      return {
        className: 'flex flex-col gap-4',
        style: {
          padding: 16,
          border: '1px solid var(--cz-border)',
          borderRadius: 'var(--cz-radius-md)',
          backgroundColor: 'var(--cz-bg)',
          boxShadow: 'var(--cz-shadow-sm)',
        },
      };
    case 'divider':
      return {
        style: {
          marginTop: 12,
          marginBottom: 12,
        },
      };
    case 'list':
      return {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        },
      };
    case 'text':
      return {
        style: {
          color: 'var(--cz-text-secondary)',
          fontSize: 14,
          lineHeight: 1.6,
        },
      };
    case 'heading':
      return { style: headingStyle((schema as HeadingComponent).level ?? 2) };
    case 'tag':
      return {
        style: {
          verticalAlign: 'middle',
        },
      };
    case 'stat':
      return {
        style: {
          boxShadow: 'var(--cz-shadow-sm)',
        },
      };
    case 'form':
      return {
        style: formStyle(schema as FormComponent),
      };
    case 'button':
      return {
        style: buttonStyle(schema as ButtonComponent),
      };
    case 'link':
      return {
        style: {
          fontWeight: 500,
        },
      };
    case 'dialog':
      return {
        style: {
          border: '1px solid var(--cz-border)',
          boxShadow: 'var(--cz-shadow-md)',
        },
      };
    case 'alert':
      return {
        style: {
          boxShadow: 'var(--cz-shadow-sm)',
        },
      };
    case 'empty':
      return {
        style: {
          border: '1px dashed var(--cz-border-strong)',
          borderRadius: 'var(--cz-radius-md)',
          backgroundColor: 'var(--cz-bg-subtle)',
        },
      };
    case 'table':
      return {
        className: 'overflow-hidden',
        style: {
          overflowX: 'auto',
          border: '1px solid var(--cz-border)',
          borderRadius: 'var(--cz-radius-md)',
          backgroundColor: 'var(--cz-bg)',
          boxShadow: 'var(--cz-shadow-sm)',
        },
      };
    default:
      return {};
  }
}

export function applyBuiltinSchemaDefaults<T extends ComponentSchema>(schema: T): T {
  const patch = getDefaultPatch(schema);
  if (!patch) return schema;

  let changed = false;
  const next: Record<string, unknown> = { ...(schema as Record<string, unknown>) };

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'className' || key === 'style') continue;
    if (value !== undefined && next[key] === undefined) {
      next[key] = value;
      changed = true;
    }
  }

  const mergedClassName = mergeSchemaClassName(patch.className, schema.className);
  if (mergedClassName !== schema.className) {
    if (mergedClassName === undefined) {
      delete next.className;
    } else {
      next.className = mergedClassName;
    }
    changed = true;
  }

  const mergedStyle = mergeSchemaStyle(patch.style, schema.style);
  if (!stylesEqual(mergedStyle, schema.style)) {
    if (mergedStyle === undefined) {
      delete next.style;
    } else {
      next.style = mergedStyle;
    }
    changed = true;
  }

  return changed ? (next as T) : schema;
}
