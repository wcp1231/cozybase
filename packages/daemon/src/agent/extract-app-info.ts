/**
 * Extract structured app info from free-text user input using LLM.
 *
 * Uses claude-agent-sdk query() with a lightweight model for fast,
 * cheap extraction of { slug, displayName, description } from the
 * user's idea text. No MCP tools are registered — pure text extraction.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ExtractedAppInfo {
  slug: string;
  displayName: string;
  description: string;
}

const SYSTEM_PROMPT = `You are a JSON extraction assistant. Given a user's app idea, extract exactly three fields:

- slug: a URL-safe identifier for the app (lowercase letters, numbers, hyphens only, no leading/trailing hyphens, 1-40 chars). Derive from the app concept in English even if the input is in another language.
- displayName: a human-friendly name for the app. Preserve the user's language (e.g. Chinese, Japanese, etc.) if the input is non-English.
- description: a one-sentence summary of the app's purpose.

Respond ONLY with a single JSON object. No markdown fences, no explanation:
{"slug":"...","displayName":"...","description":"..."}`;

/**
 * Call LLM to extract structured app info from a free-text idea.
 */
export async function extractAppInfo(idea: string): Promise<ExtractedAppInfo> {
  let assistantText = '';

  const q = query({
    prompt: idea,
    options: {
      model: 'claude-haiku-4-5',
      systemPrompt: SYSTEM_PROMPT,
      tools: [],
      allowedTools: [],
      permissionMode: 'acceptEdits' as any,
    },
  });

  for await (const msg of q) {
    // Capture assistant text
    if (msg.type === 'assistant' && (msg as any).message?.content) {
      assistantText = extractTextContent((msg as any).message.content);
    }

    // Also check result for text
    if (msg.type === 'result') {
      if ((msg as any).is_error) {
        throw new Error(`LLM extraction failed: ${(msg as any).result ?? 'unknown error'}`);
      }
      if ('result_text' in msg && typeof (msg as any).result_text === 'string') {
        assistantText = (msg as any).result_text || assistantText;
      }
    }
  }

  return parseExtraction(assistantText, idea);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseExtraction(text: string, fallbackIdea: string): ExtractedAppInfo {
  // Try JSON parse first
  try {
    const trimmed = text.trim();
    // Strip markdown code fences if present
    const jsonStr = trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);

    if (parsed.slug && typeof parsed.slug === 'string') {
      return {
        slug: sanitizeSlug(parsed.slug),
        displayName: String(parsed.displayName ?? parsed.display_name ?? ''),
        description: String(parsed.description ?? ''),
      };
    }
  } catch {
    // Fall through to regex
  }

  // Regex fallback — extract individual fields from malformed JSON
  const slugMatch = text.match(/"slug"\s*:\s*"([^"]+)"/);
  const nameMatch =
    text.match(/"displayName"\s*:\s*"([^"]+)"/) ??
    text.match(/"display_name"\s*:\s*"([^"]+)"/);
  const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/);

  if (slugMatch) {
    return {
      slug: sanitizeSlug(slugMatch[1]),
      displayName: nameMatch?.[1] ?? '',
      description: descMatch?.[1] ?? '',
    };
  }

  // Last resort: generate slug from idea text
  return {
    slug: generateSlugFromText(fallbackIdea),
    displayName: fallbackIdea.slice(0, 100),
    description: '',
  };
}

function sanitizeSlug(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'my-app'
  );
}

function generateSlugFromText(text: string): string {
  const words = text
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return 'my-app';
  return sanitizeSlug(words.join('-'));
}

/**
 * Ensure slug doesn't conflict with existing apps.
 * Appends -2, -3, etc. until a unique slug is found.
 */
export function deduplicateSlug(
  slug: string,
  exists: (s: string) => boolean,
): string {
  if (!exists(slug)) return slug;
  for (let i = 2; i <= 100; i++) {
    const candidate = `${slug}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

// ---------------------------------------------------------------------------

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');
}
