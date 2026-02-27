export interface ThemeConfig {
  mode?: 'light' | 'dark' | 'system';
  primaryColor?: string;
  fontFamily?: string;
  tokens?: Record<string, string>;
}

export type ThemeTokens = Record<string, string>;
