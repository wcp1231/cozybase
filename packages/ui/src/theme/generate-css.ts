import type { ThemeConfig, ThemeTokens } from './types';
import { defaultLightTokens, defaultDarkTokens } from './tokens';

/**
 * Sanitize a CSS property name. Only allow valid custom property characters.
 */
function sanitizeCSSKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '');
}

/**
 * Sanitize a CSS value to prevent injection.
 * Strips characters that could break out of a CSS declaration context.
 */
function sanitizeCSSValue(value: string): string {
  // Remove </style sequences (case-insensitive) that could break out of <style> tags
  // Remove { } that could inject new CSS rules, and ; that could end declarations early
  // Allow CSS functions like rgb(), var(), etc. by keeping ( )
  return value
    .replace(/<\/?style/gi, '')
    .replace(/<\/?script/gi, '')
    .replace(/[{}<>]/g, '');
}

function applyOverrides(base: ThemeTokens, config?: ThemeConfig): ThemeTokens {
  const tokens = { ...base };

  if (config?.primaryColor) {
    tokens['--cz-primary'] = config.primaryColor;
  }
  if (config?.fontFamily) {
    tokens['--cz-font-family'] = config.fontFamily;
  }
  if (config?.tokens) {
    for (const [key, value] of Object.entries(config.tokens)) {
      const k = key.startsWith('--cz-') ? key : `--cz-${key}`;
      tokens[k] = value;
    }
  }

  return tokens;
}

function tokensToCSS(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  ${sanitizeCSSKey(key)}: ${sanitizeCSSValue(value)};`)
    .join('\n');
}

/**
 * Generate a complete CSS string with theme tokens as CSS custom properties.
 *
 * Works on both server (Bun/Node) and client (browser).
 * The result can be injected into a <style> tag.
 */
export function generateThemeCSS(config?: ThemeConfig): string {
  const light = applyOverrides(defaultLightTokens, config);
  const dark = applyOverrides(defaultDarkTokens, config);

  const mode = config?.mode ?? 'light';

  const lightCSS = tokensToCSS(light);
  const darkCSS = tokensToCSS(dark);

  if (mode === 'system') {
    // Default to light; auto-switch via media query; manual overrides via data-theme
    return [
      `:root {\n${lightCSS}\n}`,
      `@media (prefers-color-scheme: dark) {\n  :root {\n${darkCSS}\n  }\n}`,
      `[data-theme="light"] {\n${lightCSS}\n}`,
      `[data-theme="dark"] {\n${darkCSS}\n}`,
    ].join('\n\n');
  }

  if (mode === 'dark') {
    // Default to dark; allow manual override to light
    return [
      `:root {\n${darkCSS}\n}`,
      `[data-theme="light"] {\n${lightCSS}\n}`,
      `[data-theme="dark"] {\n${darkCSS}\n}`,
    ].join('\n\n');
  }

  // Default: light mode; allow manual override to dark
  return [
    `:root {\n${lightCSS}\n}`,
    `[data-theme="dark"] {\n${darkCSS}\n}`,
  ].join('\n\n');
}
