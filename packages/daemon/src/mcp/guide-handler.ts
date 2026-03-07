/**
 * Guide Handler — implements the get_guide(topic) MCP tool.
 *
 * Resolves a hierarchical topic path (e.g. "ui/components/table")
 * to a markdown file under the guides/ directory and returns its content.
 * Automatically appends subtopic listings for directory-level topics.
 */

import { resolve, join, relative } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolveGuidesDir } from '../runtime-paths';

/** Root directory for guide markdown files */
const GUIDES_DIR = resolveGuidesDir();

/** Only allow safe characters in topic paths */
const TOPIC_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9\-\/]*$/;

/**
 * Handle a get_guide(topic) request.
 * Returns the markdown content for the given topic, or an error message.
 */
export function handleGetGuide(topic: string): string {
  // Validate topic path
  if (!topic || !TOPIC_PATTERN.test(topic)) {
    return formatError(
      `Invalid topic path: "${topic}". ` +
      `Topic must contain only letters, numbers, hyphens, and "/".`,
    );
  }

  // Block path traversal
  if (topic.includes('..') || topic.startsWith('/')) {
    return formatError(`Invalid topic path: "${topic}". Path traversal is not allowed.`);
  }

  // Normalize: strip trailing slashes
  const normalized = topic.replace(/\/+$/, '');

  // Resolve file path: try {topic}.md first, then {topic}/index.md
  const directPath = resolve(GUIDES_DIR, `${normalized}.md`);
  const indexPath = resolve(GUIDES_DIR, normalized, 'index.md');

  // Ensure resolved path is within GUIDES_DIR (defense in depth)
  if (!directPath.startsWith(GUIDES_DIR) || !indexPath.startsWith(GUIDES_DIR)) {
    return formatError(`Invalid topic path: "${topic}".`);
  }

  let filePath: string | null = null;
  let isDirectory = false;

  if (existsSync(directPath)) {
    filePath = directPath;
  } else if (existsSync(indexPath)) {
    filePath = indexPath;
    isDirectory = true;
  }

  if (!filePath) {
    const available = listTopLevelTopics();
    return formatError(
      `Topic "${topic}" not found.\n\n` +
      `Available topics:\n${available.map((t) => `- ${t}`).join('\n')}`,
    );
  }

  let content = stripMarkdownHtmlComments(readFileSync(filePath, 'utf-8'));

  // Append subtopics if this is a directory-level topic
  if (isDirectory) {
    const subtopics = discoverSubtopics(normalized);
    if (subtopics.length > 0) {
      content += '\n\n---\nSubtopics:\n';
      for (const sub of subtopics) {
        content += `- ${sub.path}${sub.description ? ` — ${sub.description}` : ''}\n`;
      }
    }
  }

  return content;
}

// ---- Internal helpers ----

interface SubtopicEntry {
  path: string;
  description?: string;
}

/**
 * Discover subtopics under a given topic directory.
 * Scans for .md files (excluding index.md) and subdirectories with index.md.
 */
function discoverSubtopics(topic: string): SubtopicEntry[] {
  const dir = resolve(GUIDES_DIR, topic);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const entries: SubtopicEntry[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith('.md') && entry !== 'index.md') {
      const name = entry.replace(/\.md$/, '');
      entries.push({ path: `${topic}/${name}` });
    } else if (stat.isDirectory()) {
      const subIndex = join(fullPath, 'index.md');
      const description = existsSync(subIndex)
        ? extractTitle(readFileSync(subIndex, 'utf-8'))
        : undefined;
      entries.push({ path: `${topic}/${entry}`, description });
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * List all top-level topics (files and directories in guides/).
 */
function listTopLevelTopics(): string[] {
  if (!existsSync(GUIDES_DIR)) return [];

  const topics: string[] = [];
  for (const entry of readdirSync(GUIDES_DIR)) {
    const fullPath = join(GUIDES_DIR, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith('.md')) {
      topics.push(entry.replace(/\.md$/, ''));
    } else if (stat.isDirectory()) {
      topics.push(entry);
    }
  }

  return topics.sort();
}

/**
 * Extract the first # heading from markdown content.
 */
function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

export function stripMarkdownHtmlComments(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inFence = false;
  let fenceMarker: '```' | '~~~' | null = null;
  let inHtmlComment = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const marker = trimmed.startsWith('```')
      ? '```'
      : trimmed.startsWith('~~~')
        ? '~~~'
        : null;

    if (marker) {
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = null;
      }
      result.push(line);
      continue;
    }

    if (inFence) {
      result.push(line);
      continue;
    }

    let nextLine = '';
    let index = 0;
    while (index < line.length) {
      if (inHtmlComment) {
        const commentEnd = line.indexOf('-->', index);
        if (commentEnd === -1) {
          index = line.length;
          break;
        }
        inHtmlComment = false;
        index = commentEnd + 3;
        continue;
      }

      const commentStart = line.indexOf('<!--', index);
      if (commentStart === -1) {
        nextLine += line.slice(index);
        break;
      }

      nextLine += line.slice(index, commentStart);
      inHtmlComment = true;
      index = commentStart + 4;
    }

    result.push(nextLine);
  }

  return result.join('\n');
}

function formatError(message: string): string {
  return `Error: ${message}`;
}
