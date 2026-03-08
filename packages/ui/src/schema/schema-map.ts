import { z } from 'zod';
import {
  isBuiltinComponentType,
  pageComponentSchema,
  rowComponentSchema,
  colComponentSchema,
  cardComponentSchema,
  tabsComponentSchema,
  dividerComponentSchema,
  tableComponentSchema,
  listComponentSchema,
  textComponentSchema,
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
  type BuiltinComponentType,
} from './zod';

export type ComponentObjectSchema = z.AnyZodObject;
export type ComponentShape = Record<string, z.ZodTypeAny>;
export type SchemaFieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'json';

export interface ComponentFieldMeta {
  optional: boolean;
  kind: SchemaFieldKind;
  enumValues?: string[];
}

export const componentSchemaMap: Record<BuiltinComponentType, ComponentObjectSchema> = {
  page: pageComponentSchema,
  row: rowComponentSchema,
  col: colComponentSchema,
  card: cardComponentSchema,
  tabs: tabsComponentSchema,
  divider: dividerComponentSchema,
  table: tableComponentSchema,
  list: listComponentSchema,
  text: textComponentSchema,
  heading: headingComponentSchema,
  tag: tagComponentSchema,
  stat: statComponentSchema,
  form: formComponentSchema,
  input: inputComponentSchema,
  textarea: textareaComponentSchema,
  number: numberComponentSchema,
  select: selectComponentSchema,
  switch: switchComponentSchema,
  checkbox: checkboxComponentSchema,
  radio: radioComponentSchema,
  'date-picker': datePickerComponentSchema,
  button: buttonComponentSchema,
  link: linkComponentSchema,
  dialog: dialogComponentSchema,
  alert: alertComponentSchema,
  empty: emptyComponentSchema,
};

export function getComponentSchemaForType(type: string): ComponentObjectSchema | null {
  if (!isBuiltinComponentType(type)) return null;
  return componentSchemaMap[type];
}

export function getComponentSchemaShape(type: string): ComponentShape | null {
  const schema = getComponentSchemaForType(type);
  return schema ? (schema.shape as ComponentShape) : null;
}

export function getComponentFieldMeta(type: string, key: string): ComponentFieldMeta | null {
  const shape = getComponentSchemaShape(type);
  const fieldSchema = shape?.[key];
  if (!fieldSchema) return null;

  const base = unwrapSchema(fieldSchema);
  if (base instanceof z.ZodEnum) {
    return {
      optional: isOptional(fieldSchema),
      kind: 'enum',
      enumValues: [...base.options],
    };
  }
  if (base instanceof z.ZodBoolean) {
    return { optional: isOptional(fieldSchema), kind: 'boolean' };
  }
  if (base instanceof z.ZodNumber) {
    return { optional: isOptional(fieldSchema), kind: 'number' };
  }
  if (base instanceof z.ZodObject || base instanceof z.ZodArray || base instanceof z.ZodRecord) {
    return { optional: isOptional(fieldSchema), kind: 'json' };
  }
  return { optional: isOptional(fieldSchema), kind: 'string' };
}

export function listComponentSchemaTypes(): BuiltinComponentType[] {
  return Object.keys(componentSchemaMap) as BuiltinComponentType[];
}

function unwrapSchema(fieldSchema: z.ZodTypeAny): z.ZodTypeAny {
  let current = fieldSchema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodEffects
  ) {
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = current.removeDefault();
      continue;
    }
    current = current.unwrap();
  }
  return current;
}

function isOptional(fieldSchema: z.ZodTypeAny): boolean {
  return fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault;
}
