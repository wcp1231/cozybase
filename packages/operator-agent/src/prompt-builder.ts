import type { AppContext } from './types';

function renderSchemaSection(appContext: AppContext): string {
  if (appContext.schema.length === 0) {
    return '## 数据表\n当前 APP 没有可用的数据表。';
  }

  const sections = appContext.schema.map((table) => {
    const rows = table.columns.length === 0
      ? '| 列名 | 类型 | 主键 | 非空 |\n| --- | --- | --- | --- |\n| (无列) | - | - | - |'
      : [
          '| 列名 | 类型 | 主键 | 非空 |',
          '| --- | --- | --- | --- |',
          ...table.columns.map((column) => (
            `| ${column.name} | ${column.type} | ${column.primaryKey ? '是' : '否'} | ${column.notNull ? '是' : '否'} |`
          )),
        ].join('\n');

    return `### 表：${table.name}\n${rows}`;
  });

  return `## 数据表\n${sections.join('\n\n')}`;
}

function renderFunctionSection(appContext: AppContext): string {
  if (appContext.functions.length === 0) {
    return '';
  }

  const lines = appContext.functions.map((fn) => `- \`${fn.methods.join('/') || 'GET'} /fn/${fn.name}\``);
  return `## 自定义 Functions\n${lines.join('\n')}`;
}

export function buildOperatorSystemPrompt(appContext: AppContext): string {
  const description = appContext.description?.trim()
    ? appContext.description.trim()
    : '未提供描述';

  const sections = [
    '# Cozybase APP Operator',
    '你是 Cozybase APP 的操作助手。你负责根据用户的中文指令，调用工具完成 Stable APP 内的数据查询和数据操作。',
    '## APP 信息',
    `- 名称：${appContext.displayName}`,
    `- 描述：${description}`,
    renderSchemaSection(appContext),
    renderFunctionSection(appContext),
    '## 操作规则',
    '- 始终基于当前 APP 的 schema 和可用 functions 做判断，不要假设不存在的表、列或接口。',
    '- 查询类请求优先先查再答，答案保持简洁、直接、使用中文。',
    '- 执行删除前必须先向用户确认；未得到明确确认时不要调用删除工具。',
    '- 写入、更新、调用 function 后，要简要说明执行结果；失败时明确说明原因。',
  ].filter(Boolean);

  return sections.join('\n\n');
}
