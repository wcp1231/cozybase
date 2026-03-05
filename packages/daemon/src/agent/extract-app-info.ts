/**
 * Extract structured app info from free-text user input via AgentProvider.
 *
 * This is provider-agnostic and works with Claude/Codex by consuming
 * normalized AgentEvent streams.
 */

import type { AgentProvider } from '@cozybase/agent';

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

export interface ExtractAppInfoOptions {
  provider: AgentProvider;
  cwd: string;
  model?: string;
  providerOptions?: unknown;
}

/**
 * Call provider to extract structured app info from a free-text idea.
 */
export async function extractAppInfo(
  idea: string,
  options: ExtractAppInfoOptions,
): Promise<ExtractedAppInfo> {
  const query = options.provider.createQuery({
    prompt: idea,
    systemPrompt: SYSTEM_PROMPT,
    cwd: options.cwd,
    model: options.model,
    providerOptions: options.providerOptions,
  });

  let assistantText = '';

  for await (const event of query) {
    if (event.type === 'conversation.message.completed' && event.role === 'assistant') {
      assistantText = event.content || assistantText;
    }
    if (event.type === 'conversation.error') {
      throw new Error(`LLM extraction failed: ${event.message}`);
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

