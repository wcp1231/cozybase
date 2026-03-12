/**
 * Component category classification for pages.json.
 *
 * Categories drive:
 * - Tooling validation (e.g. "data" components must have `api`)
 * - Outline summary generation
 * - Smart defaults when inserting new nodes
 */

export const COMPONENT_CATEGORIES = {
  /** Layout containers — always have `children: ComponentSchema[]` */
  container: ['page', 'row', 'col', 'card', 'dialog'] as const,

  /** Text display — primary content is a `text` or `content` string field */
  text: ['text', 'markdown', 'heading', 'tag'] as const,

  /** Data-driven — load remote data via `api: ApiConfig` */
  data: ['table', 'list', 'form'] as const,

  /** User inputs — have `value` and optionally `onChange` */
  input: ['input', 'textarea', 'number', 'select', 'switch', 'checkbox', 'radio', 'date-picker'] as const,

  /** Interactive triggers — have `action: ActionSchema | ActionSchema[]` */
  action: ['button', 'link'] as const,

  /** Structural / decorative */
  structural: ['tabs', 'divider'] as const,

  /** Status / feedback display */
  feedback: ['stat', 'alert', 'empty'] as const,
} as const;

export type ComponentCategory = keyof typeof COMPONENT_CATEGORIES;
export type CategoryMembers = typeof COMPONENT_CATEGORIES[ComponentCategory][number];

/** Reverse map: component type → category */
const typeToCategory = new Map<string, ComponentCategory>();
for (const [category, types] of Object.entries(COMPONENT_CATEGORIES)) {
  for (const type of types) {
    typeToCategory.set(type, category as ComponentCategory);
  }
}

export function getComponentCategory(type: string): ComponentCategory | null {
  return typeToCategory.get(type) ?? null;
}

export function isContainerType(type: string): boolean {
  return (COMPONENT_CATEGORIES.container as readonly string[]).includes(type);
}

export function isDataType(type: string): boolean {
  return (COMPONENT_CATEGORIES.data as readonly string[]).includes(type);
}

export function isInputType(type: string): boolean {
  return (COMPONENT_CATEGORIES.input as readonly string[]).includes(type);
}

export function isActionType(type: string): boolean {
  return (COMPONENT_CATEGORIES.action as readonly string[]).includes(type);
}

/**
 * Generate a human-readable summary for a component node.
 * Used by page_outline to give context without exposing full props.
 */
export function getComponentSummary(node: Record<string, unknown>): string {
  const type = String(node.type ?? '');
  const category = getComponentCategory(type);

  switch (category) {
    case 'container': {
      const children = node.children;
      const count = Array.isArray(children) ? children.length : 0;
      return `${count} children`;
    }
    case 'text': {
      const text = node.text ?? node.content ?? node.label ?? node.message ?? '';
      return truncate(String(text), 40);
    }
    case 'data': {
      if (type === 'table') {
        const api = (node.api as Record<string, unknown> | undefined)?.url ?? '';
        const cols = Array.isArray(node.columns) ? node.columns.length : 0;
        return `api:${api}, ${cols} columns`;
      }
      if (type === 'list') {
        const api = (node.api as Record<string, unknown> | undefined)?.url ?? '';
        return `api:${api}`;
      }
      if (type === 'form') {
        const fields = Array.isArray(node.fields) ? node.fields.length : 0;
        return `${fields} fields`;
      }
      return '';
    }
    case 'input': {
      const placeholder = node.placeholder;
      if (placeholder) return truncate(String(placeholder), 40);
      return type;
    }
    case 'action': {
      const label = node.label ?? node.text ?? '';
      return truncate(String(label), 40);
    }
    case 'structural': {
      if (type === 'tabs') {
        const items = Array.isArray(node.items) ? node.items.length : 0;
        return `${items} items`;
      }
      const label = node.label;
      return label ? truncate(String(label), 40) : type;
    }
    case 'feedback': {
      if (type === 'stat') {
        const label = node.label ?? '';
        return truncate(String(label), 40);
      }
      const message = node.message ?? node.alertType ?? '';
      return truncate(String(message), 40);
    }
    default:
      return type;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}
