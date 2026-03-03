import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { relative, resolve } from 'path';

type PropertyMeta = {
  name: string;
  type: string;
  required: boolean;
};

type InterfaceMeta = {
  name: string;
  extendsComponentBase: boolean;
  body: string;
};

type ComponentMeta = {
  type: string;
  category: string;
  props: PropertyMeta[];
};

const CATEGORY_BY_TYPE: Record<string, string> = {
  page: 'Layout',
  row: 'Layout',
  col: 'Layout',
  card: 'Layout',
  tabs: 'Layout',
  divider: 'Layout',
  table: 'Data Display',
  list: 'Data Display',
  text: 'Data Display',
  heading: 'Data Display',
  tag: 'Data Display',
  stat: 'Data Display',
  form: 'Data Input',
  input: 'Data Input',
  textarea: 'Data Input',
  number: 'Data Input',
  select: 'Data Input',
  switch: 'Data Input',
  checkbox: 'Data Input',
  radio: 'Data Input',
  'date-picker': 'Data Input',
  button: 'Interaction',
  link: 'Interaction',
  dialog: 'Feedback',
  alert: 'Feedback',
  empty: 'Feedback',
};

const CATEGORY_ORDER = [
  'Layout',
  'Data Display',
  'Data Input',
  'Interaction',
  'Feedback',
];

const daemonRoot = resolve(import.meta.dir, '..');
const schemaPath = resolve(daemonRoot, '../ui/src/schema/types.ts');
const componentGuidesDir = resolve(daemonRoot, 'guides/ui/components');
const commonPropertiesGuidePath = resolve(
  daemonRoot,
  'guides/ui/common-properties.md',
);
const repoRoot = resolve(daemonRoot, '../..');
const sourceFileLabel = 'packages/ui/src/schema/types.ts';
const START_MARKER = '<!-- AUTO-GENERATED-PROPS:START -->';
const END_MARKER = '<!-- AUTO-GENERATED-PROPS:END -->';
const COMMON_FIELDS_FALLBACK_DESCRIPTIONS = new Map([
  [
    'type',
    'Component type. Use a built-in type like `card`, `table`, `input`, etc., or the name of a custom component declared under top-level `components`.',
  ],
  [
    'id',
    'Stable component ID for cross-component references. Needed when another expression reads `${componentId.value}` / `${componentId.data}`, or when an action targets this component via `reload`.',
  ],
  [
    'visible',
    'Whether the component should render. Accepts a boolean or an expression like `"${form.role === \'admin\'}"`.',
  ],
  ['className', 'Extra CSS class names appended to the component\'s root element.'],
  [
    'style',
    'Inline style object applied to the component\'s root element. Values may be plain strings/numbers or expressions.',
  ],
]);
const COMMON_CUSTOM_FALLBACK_DESCRIPTIONS = new Map([
  [
    'props',
    'Props passed into the custom component template and exposed inside it as `${props.xxx}`.',
  ],
]);

function main() {
  const checkOnly = process.argv.includes('--check');
  const schemaSource = readFileSync(schemaPath, 'utf8');
  const interfaces = collectInterfaces(schemaSource);

  const componentBase = interfaces.get('ComponentBase');
  if (!componentBase) {
    throw new Error('Interface "ComponentBase" not found.');
  }

  const customComponentInstance = interfaces.get('CustomComponentInstance');
  if (!customComponentInstance) {
    throw new Error('Interface "CustomComponentInstance" not found.');
  }

  const commonProps = extractProperties(componentBase);
  const customOnlyProps = extractProperties(customComponentInstance)
    .filter((prop) => prop.name === 'props');

  const components = collectBuiltInComponents(interfaces);
  validateCategories(components);

  const warnings: string[] = [];
  const changedFiles: string[] = [];
  for (const component of components) {
    const guidePath = resolve(componentGuidesDir, `${component.type}.md`);
    if (!existsSync(guidePath)) {
      warnings.push(`Missing guide file for component "${component.type}": ${guidePath}`);
      continue;
    }

    const guideContent = readFileSync(guidePath, 'utf8');
    const headDescriptions = readHeadDescriptions(guidePath, '## Properties');
    const updated = syncPropertiesSection(
      guideContent,
      component.props,
      component.type,
      headDescriptions,
    );

    if (!updated) {
      warnings.push(`No "## Properties" section found for component "${component.type}".`);
      continue;
    }

    if (updated !== guideContent) {
      changedFiles.push(relative(repoRoot, guidePath));
      if (!checkOnly) {
        writeFileSync(guidePath, updated);
      }
    }
  }

  if (existsSync(commonPropertiesGuidePath)) {
    const guideContent = readFileSync(commonPropertiesGuidePath, 'utf8');
    const updated = syncCommonPropertiesGuide(
      guideContent,
      commonProps,
      customOnlyProps,
    );
    if (updated !== guideContent) {
      changedFiles.push(relative(repoRoot, commonPropertiesGuidePath));
      if (!checkOnly) {
        writeFileSync(commonPropertiesGuidePath, updated);
      }
    }
  }

  if (checkOnly) {
    if (changedFiles.length === 0 && warnings.length === 0) {
      console.log(`UI guide property tables are in sync with ${sourceFileLabel}`);
      return;
    }

    if (changedFiles.length > 0) {
      console.error(
        [
          `UI guide property tables are out of sync with ${sourceFileLabel}:`,
          ...changedFiles.map((file) => `- ${file}`),
        ].join('\n'),
      );
    }

    if (warnings.length > 0) {
      console.error(warnings.join('\n'));
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `Synced schema-derived property tables for ${changedFiles.length} guide files from ${sourceFileLabel}`,
  );

  if (warnings.length > 0) {
    console.warn(warnings.join('\n'));
  }
}

function collectInterfaces(source: string): Map<string, InterfaceMeta> {
  const interfaces = new Map<string, InterfaceMeta>();
  const pattern = /export interface\s+([A-Za-z0-9_]+)(?:\s+extends\s+([^{]+))?\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    const extendsClause = match[2] ?? '';
    const bodyStart = pattern.lastIndex;
    const bodyEnd = findMatchingBrace(source, bodyStart - 1);
    const body = source.slice(bodyStart, bodyEnd).trim();

    interfaces.set(name, {
      name,
      extendsComponentBase: extendsClause.includes('ComponentBase'),
      body,
    });

    pattern.lastIndex = bodyEnd + 1;
  }

  return interfaces;
}

function collectBuiltInComponents(
  interfaces: Map<string, InterfaceMeta>,
): ComponentMeta[] {
  const components: ComponentMeta[] = [];

  for (const iface of interfaces.values()) {
    if (!iface.extendsComponentBase) continue;

    const componentType = getLiteralComponentType(iface);
    if (!componentType) continue;

    components.push({
      type: componentType,
      category: CATEGORY_BY_TYPE[componentType] ?? 'Uncategorized',
      props: extractProperties(iface).filter((prop) => prop.name !== 'type'),
    });
  }

  return components.sort((a, b) => compareComponents(a, b));
}

function getLiteralComponentType(iface: InterfaceMeta): string | null {
  for (const prop of extractProperties(iface)) {
    if (prop.name !== 'type') continue;
    const literal = prop.type.match(/^'([^']+)'$/);
    if (literal) {
      return literal[1];
    }
  }

  return null;
}

function extractProperties(iface: InterfaceMeta): PropertyMeta[] {
  const properties: PropertyMeta[] = [];
  const members = splitInterfaceMembers(iface.body);

  for (const member of members) {
    const prop = parsePropertyLine(member);
    if (!prop) continue;
    properties.push({
      name: prop.name,
      type: normalizeType(prop.type),
      required: prop.required,
    });
  }

  return properties;
}

function splitInterfaceMembers(body: string): string[] {
  const sanitized = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const members: string[] = [];
  let current = '';
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;
  let inString: '"' | '\'' | '`' | null = null;

  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    const previous = sanitized[i - 1];

    current += char;

    if (inString) {
      if (char === inString && previous !== '\\') {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = char;
      continue;
    }

    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth -= 1;
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;
    if (char === '<') angleDepth += 1;
    if (char === '>') angleDepth -= 1;

    if (
      char === ';' &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0
    ) {
      const member = current.slice(0, -1).trim();
      if (member) members.push(member);
      current = '';
    }
  }

  const trailing = current.trim();
  if (trailing) {
    members.push(trailing);
  }

  return members;
}

function parsePropertyLine(
  line: string,
): { name: string; type: string; required: boolean } | null {
  const normalized = normalizeType(line);
  const match = normalized.match(/^([A-Za-z0-9_-]+)(\?)?:\s*(.+)$/);
  if (!match) return null;

  return {
    name: match[1],
    required: !match[2],
    type: match[3],
  };
}

function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;

  for (let i = openBraceIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error(`Unmatched interface brace near index ${openBraceIndex}.`);
}

function normalizeType(typeText: string): string {
  return typeText.replace(/\s+/g, ' ').trim();
}

function compareComponents(a: ComponentMeta, b: ComponentMeta): number {
  const categoryDiff =
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (categoryDiff !== 0) return categoryDiff;
  return a.type.localeCompare(b.type);
}

function validateCategories(components: ComponentMeta[]) {
  const generatedTypes = new Set(components.map((component) => component.type));
  const mappedTypes = new Set(Object.keys(CATEGORY_BY_TYPE));

  const missingMappings = [...generatedTypes].filter((type) => !mappedTypes.has(type));
  const staleMappings = [...mappedTypes].filter((type) => !generatedTypes.has(type));

  if (missingMappings.length > 0 || staleMappings.length > 0) {
    throw new Error(
      [
        'Component category mapping is out of sync.',
        missingMappings.length > 0
          ? `Missing mappings: ${missingMappings.join(', ')}`
          : null,
        staleMappings.length > 0
          ? `Stale mappings: ${staleMappings.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}

function syncCommonPropertiesGuide(
  content: string,
  commonProps: PropertyMeta[],
  customOnlyProps: PropertyMeta[],
): string {
  let next = syncPropertiesSection(
    content,
    commonProps,
    'common-properties',
    COMMON_FIELDS_FALLBACK_DESCRIPTIONS,
    '## Shared Fields',
    'Field',
  );

  if (!next) {
    throw new Error(
      `Unable to find "## Shared Fields" section in ${commonPropertiesGuidePath}`,
    );
  }

  next = syncPropertiesSection(
    next,
    customOnlyProps,
    'common-properties',
    COMMON_CUSTOM_FALLBACK_DESCRIPTIONS,
    'Custom component instances support one additional field:',
    'Field',
  );

  if (!next) {
    throw new Error(
      `Unable to find custom component field section in ${commonPropertiesGuidePath}`,
    );
  }

  return next;
}

function syncPropertiesSection(
  content: string,
  properties: PropertyMeta[],
  componentType: string,
  fallbackDescriptions = new Map<string, string>(),
  sectionHeading = '## Properties',
  firstColumnLabel: 'Field' | 'Property' = 'Property',
): string | null {
  const sectionRange = findSectionRange(content, sectionHeading);
  if (!sectionRange) return null;

  const sectionBody = content.slice(sectionRange.bodyStart, sectionRange.end);
  const tableRange = findManagedTableRange(sectionBody);
  const descriptions = extractDescriptions(
    tableRange ? sectionBody.slice(tableRange.start, tableRange.end) : '',
  );

  const tableBlock = renderManagedTable(
    properties,
    descriptions,
    fallbackDescriptions,
    firstColumnLabel,
    componentType,
  );

  let nextSectionBody: string;
  if (tableRange) {
    const beforeTable = normalizeSectionWhitespaceBeforeTable(
      sectionBody.slice(0, tableRange.start),
    );
    const afterTable = normalizeSectionWhitespaceAfterTable(
      sectionBody.slice(tableRange.end),
    );
    nextSectionBody =
      beforeTable +
      tableBlock.trimEnd() +
      afterTable;
  } else {
    const prefix = sectionBody.startsWith('\n') ? '\n' : '\n\n';
    nextSectionBody = `${prefix}${tableBlock}${sectionBody}`;
  }

  const nextContent = (
    content.slice(0, sectionRange.bodyStart) +
    nextSectionBody +
    content.slice(sectionRange.end)
  );

  return nextContent.replace(
    new RegExp(`${escapeRegExp(END_MARKER)}\\n{3,}`, 'g'),
    `${END_MARKER}\n\n`,
  ).replace(
    new RegExp(`(${escapeRegExp(sectionHeading)})\\n{3,}${escapeRegExp(START_MARKER)}`, 'g'),
    `$1\n\n${START_MARKER}`,
  );
}

function findSectionRange(
  content: string,
  heading: string,
): { headingStart: number; bodyStart: number; end: number } | null {
  const headingPattern = new RegExp(`^${escapeRegExp(heading)}[ \\t]*$`, 'm');
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch || headingMatch.index === undefined) return null;

  const headingStart = headingMatch.index;
  const bodyStart = headingStart + headingMatch[0].length;
  const rest = content.slice(bodyStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch?.index !== undefined
    ? bodyStart + nextHeadingMatch.index
    : content.length;

  return { headingStart, bodyStart, end };
}

function findManagedTableRange(
  sectionBody: string,
): { start: number; end: number } | null {
  const markerStart = sectionBody.indexOf(START_MARKER);
  const markerEnd = sectionBody.indexOf(END_MARKER);
  if (markerStart !== -1 && markerEnd !== -1 && markerEnd > markerStart) {
    return {
      start: markerStart,
      end: markerEnd + END_MARKER.length,
    };
  }

  const lines = sectionBody.split('\n');
  let offset = 0;
  let tableStart = -1;
  let tableEnd = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith('|');

    if (tableStart === -1 && isTableLine) {
      tableStart = offset;
    }

    if (tableStart !== -1 && !isTableLine) {
      tableEnd = offset;
      break;
    }

    offset += line.length + 1;
  }

  if (tableStart !== -1 && tableEnd === -1) {
    tableEnd = sectionBody.length;
  }

  return tableStart !== -1 && tableEnd !== -1
    ? { start: tableStart, end: tableEnd }
    : null;
}

function extractDescriptions(tableBlock: string): Map<string, string> {
  const descriptions = new Map<string, string>();
  if (!tableBlock) return descriptions;

  const tableText = tableBlock
    .replace(START_MARKER, '')
    .replace(END_MARKER, '')
    .trim();
  const lines = tableText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  for (const line of lines.slice(2)) {
    const cells = splitMarkdownRow(line);
    const propertyCell = cells[0];
    const descriptionCell = cells[3];
    if (!propertyCell) continue;

    const propertyName = propertyCell.replaceAll('`', '').trim();
    if (!propertyName) continue;

    descriptions.set(propertyName, descriptionCell?.trim() ?? '');
  }

  return descriptions;
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const previous = trimmed[i - 1];

    if (char === '|' && previous !== '\\') {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function renderManagedTable(
  properties: PropertyMeta[],
  descriptions: Map<string, string>,
  fallbackDescriptions: Map<string, string>,
  firstColumnLabel: 'Field' | 'Property',
  componentType: string,
): string {
  const lines = [
    START_MARKER,
    `| ${firstColumnLabel} | Type | Required | Description |`,
    '|----------|------|----------|-------------|',
  ];

  for (const property of properties) {
    const currentDescription = descriptions.get(property.name);
    const fallbackDescription = fallbackDescriptions.get(property.name);
    const description =
      chooseDescription(currentDescription, fallbackDescription) ??
      `TODO: describe \`${property.name}\` for \`${componentType}\`.`;
    lines.push(
      `| \`${property.name}\` | ${formatTypeForDocs(property.type)} | ${property.required ? 'Yes' : 'No'} | ${escapePipes(description)} |`,
    );
  }

  lines.push(END_MARKER);
  return `${lines.join('\n')}\n`;
}

function normalizeSectionWhitespaceBeforeTable(value: string): string {
  if (value.trim() === '') return '\n\n';
  return `${value.replace(/\s+$/, '')}\n\n`;
}

function normalizeSectionWhitespaceAfterTable(value: string): string {
  if (value.trim() === '') return '\n\n';
  return `\n\n${value.replace(/^\s+/, '')}`;
}

function escapePipes(value: string): string {
  return value.replaceAll('|', '\\|');
}

function chooseDescription(
  currentDescription: string | undefined,
  fallbackDescription: string | undefined,
): string | undefined {
  if (currentDescription && !looksCorrupted(currentDescription)) {
    return currentDescription;
  }

  if (fallbackDescription && !looksCorrupted(fallbackDescription)) {
    return fallbackDescription;
  }

  return currentDescription ?? fallbackDescription;
}

function looksCorrupted(description: string): boolean {
  const trimmed = description.trim();
  return (
    trimmed === '' ||
    trimmed === 'Yes' ||
    trimmed === 'No' ||
    trimmed.includes('\\') ||
    /^'.+['`]?$/.test(trimmed)
  );
}

function formatTypeForDocs(type: string): string {
  const aliases: Record<string, string> = {
    ComponentSchema: 'Component',
    'ComponentSchema[]': 'Component[]',
    ActionSchema: 'Action',
    'ActionSchema[]': 'Action[]',
    'ActionSchema | ActionSchema[]': 'Action/Action[]',
    'ActionSchema | ActionSchema[] | undefined': 'Action/Action[]',
    'Record<string, unknown>': 'object',
  };

  const normalized = normalizeType(type);
  const replaced = aliases[normalized] ?? normalized
    .replaceAll('ComponentSchema', 'Component')
    .replaceAll('ActionSchema', 'Action');

  return `\`${escapePipes(replaced)}\``;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readHeadDescriptions(
  filePath: string,
  sectionHeading: string,
): Map<string, string> {
  const relativePath = relative(repoRoot, filePath);
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0 || !result.stdout) {
    return new Map();
  }

  const sectionRange = findSectionRange(result.stdout, sectionHeading);
  if (!sectionRange) {
    return new Map();
  }

  const sectionBody = result.stdout.slice(sectionRange.bodyStart, sectionRange.end);
  const tableRange = findManagedTableRange(sectionBody);
  if (!tableRange) {
    return new Map();
  }

  return extractDescriptions(sectionBody.slice(tableRange.start, tableRange.end));
}

main();
