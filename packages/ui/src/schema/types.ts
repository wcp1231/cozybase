/**
 * TypeScript types for pages.json schema.
 *
 * All types here are derived from Zod schemas in ./zod.ts (single source of truth).
 * Import from here for type usage; import from ./zod.ts for runtime validation.
 */

import type { z } from 'zod';
import type {
  pagesJsonSchema,
  pageSchema,
  componentSchema,
  actionSchema,
  apiConfigSchema,
  expressionContextSchema,
  propDefSchema,
  customComponentSchema,
  customComponentInstanceSchema,
  pageComponentSchema,
  rowComponentSchema,
  colComponentSchema,
  cardComponentSchema,
  tabsComponentSchema,
  tabItemSchema,
  dividerComponentSchema,
  tableComponentSchema,
  columnSchema,
  rowActionSchema,
  listComponentSchema,
  textComponentSchema,
  markdownComponentSchema,
  headingComponentSchema,
  tagComponentSchema,
  statComponentSchema,
  formComponentSchema,
  fieldSchema,
  optionItemSchema,
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
} from './zod';
import type { ActionSchemaType, ComponentSchemaType } from './zod';

// ============================================================
// Top-level
// ============================================================

export type PagesJson = z.infer<typeof pagesJsonSchema>;
export type PageSchema = z.infer<typeof pageSchema>;

// ============================================================
// ComponentSchema
// ============================================================

export type ComponentSchema = ComponentSchemaType;

// --- Layout ---
export type PageComponent = z.infer<typeof pageComponentSchema>;
export type RowComponent = z.infer<typeof rowComponentSchema>;
export type ColComponent = z.infer<typeof colComponentSchema>;
export type CardComponent = z.infer<typeof cardComponentSchema>;
export type TabsComponent = z.infer<typeof tabsComponentSchema>;
export type TabItem = z.infer<typeof tabItemSchema>;
export type DividerComponent = z.infer<typeof dividerComponentSchema>;

// --- Data Display ---
export type TableComponent = z.infer<typeof tableComponentSchema>;
export type ColumnSchema = z.infer<typeof columnSchema>;
export type RowActionSchema = z.infer<typeof rowActionSchema>;
export type ListComponent = z.infer<typeof listComponentSchema>;
export type TextComponent = z.infer<typeof textComponentSchema>;
export type MarkdownComponent = z.infer<typeof markdownComponentSchema>;
export type HeadingComponent = z.infer<typeof headingComponentSchema>;
export type TagComponent = z.infer<typeof tagComponentSchema>;
export type StatComponent = z.infer<typeof statComponentSchema>;

// --- Data Input ---
export type FormComponent = z.infer<typeof formComponentSchema>;
export type FieldSchema = z.infer<typeof fieldSchema>;
export type OptionItem = z.infer<typeof optionItemSchema>;
export type InputComponent = z.infer<typeof inputComponentSchema>;
export type TextareaComponent = z.infer<typeof textareaComponentSchema>;
export type NumberComponent = z.infer<typeof numberComponentSchema>;
export type SelectComponent = z.infer<typeof selectComponentSchema>;
export type SwitchComponent = z.infer<typeof switchComponentSchema>;
export type CheckboxComponent = z.infer<typeof checkboxComponentSchema>;
export type RadioComponent = z.infer<typeof radioComponentSchema>;
export type DatePickerComponent = z.infer<typeof datePickerComponentSchema>;

// --- Action ---
export type ButtonComponent = z.infer<typeof buttonComponentSchema>;
export type LinkComponent = z.infer<typeof linkComponentSchema>;

// --- Feedback ---
export type DialogComponent = z.infer<typeof dialogComponentSchema>;
export type AlertComponent = z.infer<typeof alertComponentSchema>;
export type EmptyComponent = z.infer<typeof emptyComponentSchema>;

// --- Custom ---
export type CustomComponentInstance = z.infer<typeof customComponentInstanceSchema>;

// Backward-compatible ComponentBase type (structural)
export type ComponentBase = {
  type: string;
  id: string;
  visible?: string | boolean;
  className?: string;
  style?: Record<string, string | number>;
};

// ============================================================
// ActionSchema
// ============================================================

export type ActionSchema = ActionSchemaType;

// Individual action types extracted from the union
export type ApiAction = Extract<ActionSchemaType, { type: 'api' }>;
export type ReloadAction = Extract<ActionSchemaType, { type: 'reload' }>;
export type DialogAction = Extract<ActionSchemaType, { type: 'dialog' }>;
export type LinkAction = Extract<ActionSchemaType, { type: 'link' }> & { params?: Record<string, string> };
export type CloseAction = Extract<ActionSchemaType, { type: 'close' }>;
export type ConfirmAction = Extract<ActionSchemaType, { type: 'confirm' }>;

// ============================================================
// ApiConfig
// ============================================================

export type ApiConfig = z.infer<typeof apiConfigSchema>;

// ============================================================
// ExpressionContext
// ============================================================

export type ExpressionContext = z.infer<typeof expressionContextSchema>;

// ============================================================
// CustomComponentSchema
// ============================================================

export type PropDef = z.infer<typeof propDefSchema>;
export type CustomComponentSchema = z.infer<typeof customComponentSchema>;

// Re-export zod schema for use by validation utilities
export { componentSchema, pagesJsonSchema, actionSchema };
