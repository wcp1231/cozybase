// ============================================================
// Top-level: PagesJson
// ============================================================

export interface PagesJson {
  pages: PageSchema[];
  components?: Record<string, CustomComponentSchema>;
}

// ============================================================
// PageSchema
// ============================================================

export interface PageSchema {
  id: string;
  title: string;
  body: ComponentSchema[];
}

// ============================================================
// ComponentSchema — base + per-type extensions
// ============================================================

export interface ComponentBase {
  type: string;
  id?: string;
  visible?: string | boolean;
  className?: string;
  style?: Record<string, string>;
}

// --- Layout ---

export interface PageComponent extends ComponentBase {
  type: 'page';
  title?: string;
  children: ComponentSchema[];
}

export interface RowComponent extends ComponentBase {
  type: 'row';
  children: ComponentSchema[];
  justify?: 'start' | 'end' | 'center' | 'space-between' | 'space-around';
  align?: 'start' | 'center' | 'end' | 'stretch';
  gap?: number;
  wrap?: boolean;
}

export interface ColComponent extends ComponentBase {
  type: 'col';
  children: ComponentSchema[];
  align?: 'start' | 'center' | 'end' | 'stretch';
  gap?: number;
}

export interface CardComponent extends ComponentBase {
  type: 'card';
  title?: string;
  children: ComponentSchema[];
  padding?: number;
  action?: ActionSchema | ActionSchema[];
}

export interface TabsComponent extends ComponentBase {
  type: 'tabs';
  items: TabItem[];
  defaultValue?: string;
}

export interface TabItem {
  label: string;
  value: string;
  body?: ComponentSchema[];
}

export interface DividerComponent extends ComponentBase {
  type: 'divider';
  label?: string;
}

// --- Data Display ---

export interface TableComponent extends ComponentBase {
  type: 'table';
  api: ApiConfig;
  columns: ColumnSchema[];
  rowActions?: RowActionSchema[];
  pagination?: boolean;
  pageSize?: number;
}

export interface ColumnSchema {
  name: string;
  label: string;
  render?: ComponentSchema;
  width?: number | string;
}

export interface RowActionSchema {
  label: string;
  action: ActionSchema | ActionSchema[];
  confirm?: string;
}

export interface ListComponent extends ComponentBase {
  type: 'list';
  api: ApiConfig;
  itemRender: ComponentSchema;
}

export interface TextComponent extends ComponentBase {
  type: 'text';
  text: string;
}

export interface HeadingComponent extends ComponentBase {
  type: 'heading';
  text: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TagComponent extends ComponentBase {
  type: 'tag';
  text: string;
  color?: 'default' | 'success' | 'warning' | 'error' | 'info' | (string & {});
}

export interface StatComponent extends ComponentBase {
  type: 'stat';
  label: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
}

// --- Data Input ---

export interface FormComponent extends ComponentBase {
  type: 'form';
  fields: FieldSchema[];
  api?: ApiConfig;
  onSuccess?: ActionSchema | ActionSchema[];
  onError?: ActionSchema | ActionSchema[];
  initialValues?: Record<string, unknown>;
  layout?: 'vertical' | 'horizontal' | 'inline';
}

export interface FieldSchema {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: OptionItem[];
  defaultValue?: unknown;
}

export interface OptionItem {
  label: string;
  value: string;
}

export interface InputComponent extends ComponentBase {
  type: 'input';
  value?: string;
  placeholder?: string;
  onChange?: ActionSchema | ActionSchema[];
}

export interface TextareaComponent extends ComponentBase {
  type: 'textarea';
  value?: string;
  placeholder?: string;
  rows?: number;
  onChange?: ActionSchema | ActionSchema[];
}

export interface NumberComponent extends ComponentBase {
  type: 'number';
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: ActionSchema | ActionSchema[];
}

export interface SelectComponent extends ComponentBase {
  type: 'select';
  value?: string | string[];
  options: OptionItem[];
  multiple?: boolean;
  placeholder?: string;
  onChange?: ActionSchema | ActionSchema[];
}

export interface SwitchComponent extends ComponentBase {
  type: 'switch';
  value?: boolean;
  onChange?: ActionSchema | ActionSchema[];
}

export interface CheckboxComponent extends ComponentBase {
  type: 'checkbox';
  value?: boolean | string[];
  label?: string;
  options?: OptionItem[];
  onChange?: ActionSchema | ActionSchema[];
}

export interface RadioComponent extends ComponentBase {
  type: 'radio';
  value?: string;
  options: OptionItem[];
  onChange?: ActionSchema | ActionSchema[];
}

export interface DatePickerComponent extends ComponentBase {
  type: 'date-picker';
  value?: string;
  format?: string;
  onChange?: ActionSchema | ActionSchema[];
}

// --- Action ---

export interface ButtonComponent extends ComponentBase {
  type: 'button';
  label: string;
  action: ActionSchema | ActionSchema[];
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: string | boolean;
  loading?: string | boolean;
}

export interface LinkComponent extends ComponentBase {
  type: 'link';
  text: string;
  action: ActionSchema | ActionSchema[];
}

// --- Feedback ---

export interface DialogComponent extends ComponentBase {
  type: 'dialog';
  title: string;
  children: ComponentSchema[];
  width?: number | string;
}

export interface AlertComponent extends ComponentBase {
  type: 'alert';
  message: string;
  alertType?: 'info' | 'success' | 'warning' | 'error';
}

export interface EmptyComponent extends ComponentBase {
  type: 'empty';
  message?: string;
}

// --- Union type ---

export type ComponentSchema =
  | PageComponent
  | RowComponent
  | ColComponent
  | CardComponent
  | TabsComponent
  | DividerComponent
  | TableComponent
  | ListComponent
  | TextComponent
  | HeadingComponent
  | TagComponent
  | StatComponent
  | FormComponent
  | InputComponent
  | TextareaComponent
  | NumberComponent
  | SelectComponent
  | SwitchComponent
  | CheckboxComponent
  | RadioComponent
  | DatePickerComponent
  | ButtonComponent
  | LinkComponent
  | DialogComponent
  | AlertComponent
  | EmptyComponent
  | CustomComponentInstance;

/** Instance of a custom component (type matches a key in components map) */
export interface CustomComponentInstance extends ComponentBase {
  type: string;
  props?: Record<string, unknown>;
}

// ============================================================
// ActionSchema
// ============================================================

export type ActionSchema =
  | ApiAction
  | ReloadAction
  | DialogAction
  | LinkAction
  | CloseAction
  | ConfirmAction;

export interface ApiAction {
  type: 'api';
  method: string;
  url: string;
  body?: Record<string, unknown>;
  onSuccess?: ActionSchema | ActionSchema[];
  onError?: ActionSchema | ActionSchema[];
}

export interface ReloadAction {
  type: 'reload';
  target: string;
}

export interface DialogAction {
  type: 'dialog';
  title: string;
  body: ComponentSchema;
  width?: number | string;
}

export interface LinkAction {
  type: 'link';
  url: string;
  params?: Record<string, string>;
}

export interface CloseAction {
  type: 'close';
}

export interface ConfirmAction {
  type: 'confirm';
  message: string;
  onConfirm: ActionSchema | ActionSchema[];
  onCancel?: ActionSchema | ActionSchema[];
}

// ============================================================
// ApiConfig (shared by table, list, form)
// ============================================================

export interface ApiConfig {
  method?: string;
  url: string;
  params?: Record<string, string>;
}

// ============================================================
// ExpressionContext
// ============================================================

export interface ExpressionContext {
  components?: Record<string, { value?: unknown; data?: unknown }>;
  row?: Record<string, unknown>;
  form?: Record<string, unknown>;
  params?: Record<string, string>;
  response?: unknown;
  props?: Record<string, unknown>;
}

// ============================================================
// CustomComponentSchema
// ============================================================

export interface PropDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'action';
  required?: boolean;
  default?: unknown;
}

export interface CustomComponentSchema {
  props?: Record<string, PropDef>;
  body: ComponentSchema;
}
