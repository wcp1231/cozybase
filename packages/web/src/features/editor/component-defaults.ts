import { generateNodeId } from '@cozybase/ui';

export function createDefaultComponent(type: string): Record<string, unknown> {
  const id = generateNodeId(type);

  switch (type) {
    case 'row':
    case 'col':
      return { type, id, children: [] };
    case 'card':
      return { type, id, title: 'Card', children: [] };
    case 'tabs':
      return {
        type,
        id,
        items: [
          {
            label: 'Tab 1',
            value: 'tab-1',
            body: [],
          },
        ],
      };
    case 'divider':
      return { type, id, label: 'Divider' };
    case 'table':
      return { type, id, api: { url: '/fn/_db/tables/items' }, columns: [] };
    case 'list':
      return {
        type,
        id,
        api: { url: '/fn/_db/tables/items' },
        itemRender: { type: 'text', id: generateNodeId('text'), text: '${item.name}' },
      };
    case 'text':
      return { type, id, text: 'New text' };
    case 'heading':
      return { type, id, text: 'Heading', level: 2 };
    case 'tag':
      return { type, id, text: 'Tag' };
    case 'stat':
      return { type, id, label: 'Metric', value: '0' };
    case 'form':
      return { type, id, fields: [] };
    case 'input':
      return { type, id, placeholder: 'Enter value' };
    case 'textarea':
      return { type, id, placeholder: 'Enter text' };
    case 'number':
      return { type, id, value: 0 };
    case 'select':
      return { type, id, options: [] };
    case 'switch':
      return { type, id, value: false };
    case 'checkbox':
      return { type, id, label: 'Checkbox', value: false };
    case 'radio':
      return { type, id, options: [] };
    case 'date-picker':
      return { type, id, format: 'YYYY-MM-DD' };
    case 'button':
      return { type, id, label: 'Button', action: { type: 'close' } };
    case 'link':
      return { type, id, text: 'Link', action: { type: 'link', url: '/home' } };
    case 'dialog':
      return { type, id, title: 'Dialog', children: [] };
    case 'alert':
      return { type, id, message: 'Alert message', alertType: 'info' };
    case 'empty':
      return { type, id, message: 'No data' };
    default:
      return { type, id };
  }
}
