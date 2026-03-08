import { getComponentFieldMeta, getComponentSchemaShape } from '@cozybase/ui';

export type PropertyEditorType = 'readonly' | 'string' | 'number' | 'boolean' | 'enum' | 'json';
export type PropertyGroup = 'Identity' | 'Content' | 'Layout' | 'Behavior' | 'Data';

export interface PropertyDescriptor {
  key: string;
  label: string;
  group: PropertyGroup;
  editor: PropertyEditorType;
  optional: boolean;
  enumValues?: string[];
}

const GROUP_ORDER: PropertyGroup[] = ['Identity', 'Content', 'Layout', 'Behavior', 'Data'];
const GROUP_LOOKUP = new Map<string, PropertyGroup>([
  ['type', 'Identity'],
  ['id', 'Identity'],
  ['text', 'Content'],
  ['label', 'Content'],
  ['message', 'Content'],
  ['title', 'Content'],
  ['placeholder', 'Content'],
  ['value', 'Content'],
  ['prefix', 'Content'],
  ['suffix', 'Content'],
  ['className', 'Layout'],
  ['style', 'Layout'],
  ['justify', 'Layout'],
  ['align', 'Layout'],
  ['gap', 'Layout'],
  ['wrap', 'Layout'],
  ['padding', 'Layout'],
  ['layout', 'Layout'],
  ['width', 'Layout'],
  ['visible', 'Behavior'],
  ['disabled', 'Behavior'],
  ['loading', 'Behavior'],
  ['variant', 'Behavior'],
  ['api', 'Data'],
  ['columns', 'Data'],
  ['options', 'Data'],
  ['fields', 'Data'],
  ['action', 'Data'],
  ['onChange', 'Data'],
  ['onSuccess', 'Data'],
  ['onError', 'Data'],
  ['rowActions', 'Data'],
  ['initialValues', 'Data'],
]);

const OMIT_KEYS = new Set(['children', 'body', 'items', 'itemRender']);
const JSON_KEYS = new Set([
  'style',
  'api',
  'columns',
  'options',
  'fields',
  'action',
  'onChange',
  'onSuccess',
  'onError',
  'rowActions',
  'initialValues',
]);
const BOOLEAN_KEYS = new Set(['wrap', 'multiple', 'pagination']);
const NUMBER_KEYS = new Set(['gap', 'padding', 'pageSize', 'rows', 'min', 'max', 'step']);
const PAGE_DESCRIPTORS: PropertyDescriptor[] = [
  { key: 'path', label: 'Path', group: 'Identity', editor: 'readonly', optional: false },
  { key: 'title', label: 'Title', group: 'Content', editor: 'string', optional: false },
  { key: 'body', label: 'Body', group: 'Data', editor: 'json', optional: false },
];

export function getPropertyDescriptors(componentType: string): PropertyDescriptor[] {
  if (componentType === 'page') {
    return PAGE_DESCRIPTORS;
  }

  const shape = getComponentSchemaShape(componentType);
  if (!shape) return [];

  return Object.entries(shape)
    .filter(([key]) => !OMIT_KEYS.has(key))
    .map(([key]) => ({
      key,
      label: toLabel(key),
      group: GROUP_LOOKUP.get(key) ?? inferGroup(key),
      editor: inferEditor(componentType, key),
      optional: getComponentFieldMeta(componentType, key)?.optional ?? false,
      enumValues: getComponentFieldMeta(componentType, key)?.enumValues,
    }))
    .sort((left, right) => {
      const groupDelta = GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group);
      if (groupDelta !== 0) return groupDelta;
      return left.key.localeCompare(right.key);
    });
}

function inferGroup(key: string): PropertyGroup {
  if (JSON_KEYS.has(key)) return 'Data';
  return 'Content';
}

function inferEditor(componentType: string, key: string): PropertyEditorType {
  if (key === 'id' || key === 'type') return 'readonly';
  if (JSON_KEYS.has(key)) return 'json';
  if (BOOLEAN_KEYS.has(key)) return 'boolean';
  if (NUMBER_KEYS.has(key)) return 'number';

  const meta = getComponentFieldMeta(componentType, key);
  switch (meta?.kind) {
    case 'enum':
      return 'enum';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'json':
      return 'json';
    default:
      return 'string';
  }
}

function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}
