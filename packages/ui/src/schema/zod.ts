/**
 * Zod Schema — Single Source of Truth for pages.json
 *
 * All TypeScript types in types.ts are derived from these schemas via z.infer.
 * Runtime validation (validate.ts) also uses these schemas directly.
 *
 * Note: Uses z.lazy() for recursive structures (components containing components,
 * actions containing actions). Explicit type annotations are needed on those
 * to break circular inference.
 */

import { z } from 'zod';

// ============================================================
// Shared primitives
// ============================================================

const expressionOrBool = z.union([z.string(), z.boolean()]);
const expressionOrNumber = z.union([z.string(), z.number()]);

export const componentBaseSchema = z.object({
  type: z.string(),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
});

// ============================================================
// Builtin type names (defined early so customComponentInstanceSchema
// can reference BUILTIN_TYPE_SET to reject malformed builtins)
// ============================================================

export const BUILTIN_COMPONENT_TYPES = [
  'page', 'row', 'col', 'card', 'tabs', 'divider',
  'table', 'list', 'text', 'markdown', 'heading', 'tag', 'stat',
  'form', 'input', 'textarea', 'number', 'select', 'switch',
  'checkbox', 'radio', 'date-picker',
  'button', 'link',
  'dialog', 'alert', 'empty',
] as const;

export type BuiltinComponentType = typeof BUILTIN_COMPONENT_TYPES[number];

export function isBuiltinComponentType(type: string): type is BuiltinComponentType {
  return (BUILTIN_COMPONENT_TYPES as readonly string[]).includes(type);
}

const BUILTIN_TYPE_SET: ReadonlySet<string> = new Set(BUILTIN_COMPONENT_TYPES);

// ============================================================
// ApiConfig
// ============================================================

export const apiConfigSchema = z.object({
  method: z.string().optional(),
  url: z.string(),
  params: z.record(z.string()).optional(),
});

// ============================================================
// Forward declarations for recursive types
// ============================================================

// ActionSchema type — forward-declared, defined below after ComponentSchema
export type ActionSchemaType =
  | { type: 'api'; method: string; url: string; body?: Record<string, unknown>; onSuccess?: ActionSchemaType | ActionSchemaType[]; onError?: ActionSchemaType | ActionSchemaType[] }
  | { type: 'reload'; target: string }
  | { type: 'dialog'; title: string; body: ComponentSchemaType; width?: number | string }
  | { type: 'link'; url: string; params?: Record<string, string> }
  | { type: 'close' }
  | { type: 'confirm'; message: string; onConfirm: ActionSchemaType | ActionSchemaType[]; onCancel?: ActionSchemaType | ActionSchemaType[] };

// ComponentSchema type — forward-declared
export type ComponentSchemaType =
  | { type: 'page'; id: string; title?: string; children: ComponentSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'row'; id: string; children: ComponentSchemaType[]; justify?: string; align?: string; gap?: number; wrap?: boolean; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'col'; id: string; children: ComponentSchemaType[]; align?: string; gap?: number; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'card'; id: string; title?: string; children: ComponentSchemaType[]; padding?: number; action?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'tabs'; id: string; items: TabItemType[]; defaultValue?: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'divider'; id: string; label?: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'table'; id: string; api: ApiConfigType; columns: ColumnSchemaType[]; rowActions?: RowActionType[]; pagination?: boolean; pageSize?: number; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'list'; id: string; api: ApiConfigType; itemRender: ComponentSchemaType; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'text'; id: string; text: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'markdown'; id: string; content: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'heading'; id: string; text: string; level?: 1 | 2 | 3 | 4 | 5 | 6; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'tag'; id: string; text: string; color?: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'stat'; id: string; label: string; value: string | number; prefix?: string; suffix?: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'form'; id: string; fields: FieldSchemaType[]; api?: ApiConfigType; onSuccess?: ActionSchemaType | ActionSchemaType[]; onError?: ActionSchemaType | ActionSchemaType[]; initialValues?: Record<string, unknown>; layout?: 'vertical' | 'horizontal' | 'inline'; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'input'; id: string; value?: string; placeholder?: string; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'textarea'; id: string; value?: string; placeholder?: string; rows?: number; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'number'; id: string; value?: number; min?: number; max?: number; step?: number; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'select'; id: string; value?: string | string[]; options: OptionItemType[]; multiple?: boolean; placeholder?: string; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'switch'; id: string; value?: boolean; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'checkbox'; id: string; value?: boolean | string[]; label?: string; options?: OptionItemType[]; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'radio'; id: string; value?: string; options: OptionItemType[]; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'date-picker'; id: string; value?: string; format?: string; onChange?: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'button'; id: string; label: string; action: ActionSchemaType | ActionSchemaType[]; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: string | boolean; loading?: string | boolean; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'link'; id: string; text: string; action: ActionSchemaType | ActionSchemaType[]; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'dialog'; id: string; title: string; children: ComponentSchemaType[]; width?: number | string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'alert'; id: string; message: string; alertType?: 'info' | 'success' | 'warning' | 'error'; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: 'empty'; id: string; message?: string; visible?: string | boolean; className?: string; style?: Record<string, string | number> }
  | { type: string; id: string; props?: Record<string, unknown>; visible?: string | boolean; className?: string; style?: Record<string, string | number> };

type ApiConfigType = z.infer<typeof apiConfigSchema>;

// ============================================================
// Sub-schemas used by components
// ============================================================

export const optionItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type OptionItemType = z.infer<typeof optionItemSchema>;

export const fieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.string(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(optionItemSchema).optional(),
  defaultValue: z.unknown().optional(),
});
export type FieldSchemaType = z.infer<typeof fieldSchema>;

export const tabItemSchema: z.ZodType<TabItemType> = z.lazy(() =>
  z.object({
    label: z.string(),
    value: z.string(),
    body: z.array(componentSchema).optional(),
  }),
);
export type TabItemType = {
  label: string;
  value: string;
  body?: ComponentSchemaType[];
};

export const columnSchema: z.ZodType<ColumnSchemaType> = z.lazy(() =>
  z.object({
    name: z.string(),
    label: z.string(),
    render: componentSchema.optional(),
    width: z.union([z.number(), z.string()]).optional(),
  }),
);
export type ColumnSchemaType = {
  name: string;
  label: string;
  render?: ComponentSchemaType;
  width?: number | string;
};

export const rowActionSchema: z.ZodType<RowActionType> = z.lazy(() =>
  z.object({
    label: z.string(),
    action: z.union([actionSchema, z.array(actionSchema)]),
    confirm: z.string().optional(),
  }),
);
export type RowActionType = {
  label: string;
  action: ActionSchemaType | ActionSchemaType[];
  confirm?: string;
};

// ============================================================
// ActionSchema
// ============================================================

export const actionSchema: z.ZodType<ActionSchemaType> = z.lazy(() =>
  z.discriminatedUnion('type', [
    // api
    z.object({
      type: z.literal('api'),
      method: z.string(),
      url: z.string(),
      body: z.record(z.unknown()).optional(),
      onSuccess: z.union([actionSchema, z.array(actionSchema)]).optional(),
      onError: z.union([actionSchema, z.array(actionSchema)]).optional(),
    }),
    // reload
    z.object({
      type: z.literal('reload'),
      target: z.string(),
    }),
    // dialog
    z.object({
      type: z.literal('dialog'),
      title: z.string(),
      body: componentSchema,
      width: z.union([z.number(), z.string()]).optional(),
    }),
    // link
    z.object({
      type: z.literal('link'),
      url: z.string(),
      params: z.record(z.string()).optional(),
    }),
    // close
    z.object({
      type: z.literal('close'),
    }),
    // confirm
    z.object({
      type: z.literal('confirm'),
      message: z.string(),
      onConfirm: z.union([actionSchema, z.array(actionSchema)]),
      onCancel: z.union([actionSchema, z.array(actionSchema)]).optional(),
    }),
  ]),
);

const actionOrArray = z.union([actionSchema, z.array(actionSchema)]);

// ============================================================
// Component schemas — Layout
// ============================================================

export const pageComponentSchema = z.object({
  type: z.literal('page'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  title: z.string().optional(),
  children: z.lazy(() => z.array(componentSchema)),
});

export const rowComponentSchema = z.object({
  type: z.literal('row'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  children: z.lazy(() => z.array(componentSchema)),
  justify: z.enum(['start', 'end', 'center', 'space-between', 'space-around']).optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  gap: z.number().optional(),
  wrap: z.boolean().optional(),
});

export const colComponentSchema = z.object({
  type: z.literal('col'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  children: z.lazy(() => z.array(componentSchema)),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  gap: z.number().optional(),
});

export const cardComponentSchema = z.object({
  type: z.literal('card'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  title: z.string().optional(),
  children: z.lazy(() => z.array(componentSchema)),
  padding: z.number().optional(),
  action: actionOrArray.optional(),
});

export const tabsComponentSchema = z.object({
  type: z.literal('tabs'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  items: z.array(tabItemSchema),
  defaultValue: z.string().optional(),
});

export const dividerComponentSchema = z.object({
  type: z.literal('divider'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  label: z.string().optional(),
});

// ============================================================
// Component schemas — Data Display
// ============================================================

export const tableComponentSchema = z.object({
  type: z.literal('table'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  api: apiConfigSchema,
  columns: z.array(columnSchema),
  rowActions: z.array(rowActionSchema).optional(),
  pagination: z.boolean().optional(),
  pageSize: z.number().optional(),
});

export const listComponentSchema = z.object({
  type: z.literal('list'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  api: apiConfigSchema,
  itemRender: z.lazy(() => componentSchema),
});

export const textComponentSchema = z.object({
  type: z.literal('text'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  text: z.string(),
});

export const markdownComponentSchema = z.object({
  type: z.literal('markdown'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  content: z.string(),
});

export const headingComponentSchema = z.object({
  type: z.literal('heading'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  text: z.string(),
  level: z.union([
    z.literal(1), z.literal(2), z.literal(3),
    z.literal(4), z.literal(5), z.literal(6),
  ]).optional(),
});

export const tagComponentSchema = z.object({
  type: z.literal('tag'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  text: z.string(),
  color: z.string().optional(),
});

export const statComponentSchema = z.object({
  type: z.literal('stat'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  label: z.string(),
  value: expressionOrNumber,
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

// ============================================================
// Component schemas — Data Input
// ============================================================

export const formComponentSchema = z.object({
  type: z.literal('form'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  fields: z.array(fieldSchema),
  api: apiConfigSchema.optional(),
  onSuccess: actionOrArray.optional(),
  onError: actionOrArray.optional(),
  initialValues: z.record(z.unknown()).optional(),
  layout: z.enum(['vertical', 'horizontal', 'inline']).optional(),
});

export const inputComponentSchema = z.object({
  type: z.literal('input'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  onChange: actionOrArray.optional(),
});

export const textareaComponentSchema = z.object({
  type: z.literal('textarea'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  rows: z.number().optional(),
  onChange: actionOrArray.optional(),
});

export const numberComponentSchema = z.object({
  type: z.literal('number'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  onChange: actionOrArray.optional(),
});

export const selectComponentSchema = z.object({
  type: z.literal('select'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  options: z.array(optionItemSchema),
  multiple: z.boolean().optional(),
  placeholder: z.string().optional(),
  onChange: actionOrArray.optional(),
});

export const switchComponentSchema = z.object({
  type: z.literal('switch'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.boolean().optional(),
  onChange: actionOrArray.optional(),
});

export const checkboxComponentSchema = z.object({
  type: z.literal('checkbox'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.union([z.boolean(), z.array(z.string())]).optional(),
  label: z.string().optional(),
  options: z.array(optionItemSchema).optional(),
  onChange: actionOrArray.optional(),
});

export const radioComponentSchema = z.object({
  type: z.literal('radio'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.string().optional(),
  options: z.array(optionItemSchema),
  onChange: actionOrArray.optional(),
});

export const datePickerComponentSchema = z.object({
  type: z.literal('date-picker'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  value: z.string().optional(),
  format: z.string().optional(),
  onChange: actionOrArray.optional(),
});

// ============================================================
// Component schemas — Action
// ============================================================

export const buttonComponentSchema = z.object({
  type: z.literal('button'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  label: z.string(),
  action: actionOrArray,
  variant: z.enum(['primary', 'secondary', 'danger', 'ghost']).optional(),
  disabled: expressionOrBool.optional(),
  loading: expressionOrBool.optional(),
});

export const linkComponentSchema = z.object({
  type: z.literal('link'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  text: z.string(),
  action: actionOrArray,
});

// ============================================================
// Component schemas — Feedback
// ============================================================

export const dialogComponentSchema = z.object({
  type: z.literal('dialog'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  title: z.string(),
  children: z.lazy(() => z.array(componentSchema)),
  width: z.union([z.number(), z.string()]).optional(),
});

export const alertComponentSchema = z.object({
  type: z.literal('alert'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  message: z.string(),
  alertType: z.enum(['info', 'success', 'warning', 'error']).optional(),
});

export const emptyComponentSchema = z.object({
  type: z.literal('empty'),
  id: z.string(),
  visible: expressionOrBool.optional(),
  className: z.string().optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  message: z.string().optional(),
});

// ============================================================
// Custom component instance (fallback for non-builtin types)
// ============================================================

// The .refine() restricts this fallback to non-builtin type names, preventing
// malformed builtins (e.g. { type: "button" } missing required "action") from
// silently matching this schema instead of failing validation.
export const customComponentInstanceSchema = componentBaseSchema
  .extend({
    props: z.record(z.unknown()).optional(),
  })
  .refine(
    (val) => !BUILTIN_TYPE_SET.has(val.type),
    (val) => ({ message: `"${val.type}" is a builtin component type — required fields are missing or invalid` }),
  );

// ============================================================
// ComponentSchema
// ============================================================

export const builtinComponentSchema: z.ZodType<ComponentSchemaType> = z.lazy(() =>
  z.union([
    pageComponentSchema,
    rowComponentSchema,
    colComponentSchema,
    cardComponentSchema,
    tabsComponentSchema,
    dividerComponentSchema,
    tableComponentSchema,
    listComponentSchema,
    textComponentSchema,
    markdownComponentSchema,
    headingComponentSchema,
    tagComponentSchema,
    statComponentSchema,
    formComponentSchema,
    inputComponentSchema,
    textareaComponentSchema,
    numberComponentSchema,
    selectComponentSchema,
    switchComponentSchema,
    checkboxComponentSchema,
    radioComponentSchema,
    datePickerComponentSchema,
    buttonComponentSchema,
    linkComponentSchema,
    dialogComponentSchema,
    alertComponentSchema,
    emptyComponentSchema,
    customComponentInstanceSchema,
  ]),
);

export const componentSchema: z.ZodType<ComponentSchemaType> = builtinComponentSchema;

// ============================================================
// CustomComponentSchema
// ============================================================

export const propDefSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'action']),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
});

export const customComponentSchema = z.object({
  props: z.record(propDefSchema).optional(),
  body: componentSchema,
});

// ============================================================
// PageSchema & PagesJson
// ============================================================

export const pageSchema = z.object({
  path: z.string(),
  title: z.string(),
  body: z.array(componentSchema),
});

export const pagesJsonSchema = z.object({
  pages: z.array(pageSchema),
  components: z.record(customComponentSchema).optional(),
});

// ============================================================
// ExpressionContext
// ============================================================

export const expressionContextSchema = z.object({
  components: z.record(z.object({
    value: z.unknown().optional(),
    data: z.unknown().optional(),
  })).optional(),
  row: z.record(z.unknown()).optional(),
  form: z.record(z.unknown()).optional(),
  params: z.record(z.string()).optional(),
  response: z.unknown().optional(),
  props: z.record(z.unknown()).optional(),
});
