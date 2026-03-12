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
    case 'markdown':
      return {
        className: [
          'text-sm leading-relaxed text-text-secondary',
          '[&_p]:m-0 [&_p+p]:mt-3',
          '[&_h1]:m-0 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-[-0.02em] [&_h1]:text-text',
          '[&_h2]:m-0 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:tracking-[-0.02em] [&_h2]:text-text',
          '[&_h3]:m-0 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-text',
          '[&_h4]:m-0 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:leading-snug [&_h4]:text-text',
          '[&_h1+*]:mt-4 [&_h2+*]:mt-4 [&_h3+*]:mt-3 [&_h4+*]:mt-3',
          '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
          '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-muted',
          '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-bg-subtle [&_pre]:p-3',
          '[&_code]:rounded [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-text',
          '[&_pre>code]:bg-transparent [&_pre>code]:p-0',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
          '[&_th]:border [&_th]:border-border [&_th]:bg-bg-subtle [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-text',
          '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
          '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
        ].join(' '),
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
