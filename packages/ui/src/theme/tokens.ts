import type { ThemeTokens } from './types';

export const defaultLightTokens: ThemeTokens = {
  // Core colors
  '--cz-primary': '#2563EB',
  '--cz-primary-light': '#93C5FD',
  '--cz-primary-bg-subtle': '#eff6ff',
  '--cz-danger': '#DC2626',
  '--cz-secondary': '#6B7280',

  // Text
  '--cz-text': '#111827',
  '--cz-text-secondary': '#374151',
  '--cz-text-muted': '#6b7280',
  '--cz-text-placeholder': '#9ca3af',

  // Backgrounds
  '--cz-bg': '#ffffff',
  '--cz-bg-subtle': '#f9fafb',
  '--cz-bg-muted': '#f3f4f6',

  // Borders
  '--cz-border': '#e5e7eb',
  '--cz-border-strong': '#d1d5db',

  // Semantic - Success
  '--cz-success-bg': '#D1FAE5',
  '--cz-success-text': '#065F46',
  '--cz-success-border': '#BBF7D0',

  // Semantic - Warning
  '--cz-warning-bg': '#FEF3C7',
  '--cz-warning-text': '#92400E',
  '--cz-warning-border': '#FDE68A',

  // Semantic - Error
  '--cz-error-bg': '#FEE2E2',
  '--cz-error-text': '#991B1B',
  '--cz-error-border': '#FECACA',

  // Semantic - Info
  '--cz-info-bg': '#EFF6FF',
  '--cz-info-text': '#1E40AF',
  '--cz-info-border': '#BFDBFE',

  // Typography
  '--cz-font-family': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

  // Border radius
  '--cz-radius-sm': '4px',
  '--cz-radius-md': '8px',
  '--cz-radius-full': '9999px',

  // Shadows
  '--cz-shadow-sm': '0 1px 3px rgba(0,0,0,0.08)',
  '--cz-shadow-md': '0 1px 3px rgba(0,0,0,0.1)',

  // Overlay
  '--cz-overlay': 'rgba(0,0,0,0.4)',
};

export const defaultDarkTokens: ThemeTokens = {
  // Core colors
  '--cz-primary': '#3b82f6',
  '--cz-primary-light': '#60a5fa',
  '--cz-primary-bg-subtle': '#1e3a5f',
  '--cz-danger': '#ef4444',
  '--cz-secondary': '#9ca3af',

  // Text (inverted)
  '--cz-text': '#f9fafb',
  '--cz-text-secondary': '#e5e7eb',
  '--cz-text-muted': '#9ca3af',
  '--cz-text-placeholder': '#6b7280',

  // Backgrounds (inverted)
  '--cz-bg': '#111827',
  '--cz-bg-subtle': '#1f2937',
  '--cz-bg-muted': '#374151',

  // Borders
  '--cz-border': '#374151',
  '--cz-border-strong': '#4b5563',

  // Semantic - Success
  '--cz-success-bg': '#064e3b',
  '--cz-success-text': '#6ee7b7',
  '--cz-success-border': '#065f46',

  // Semantic - Warning
  '--cz-warning-bg': '#451a03',
  '--cz-warning-text': '#fbbf24',
  '--cz-warning-border': '#78350f',

  // Semantic - Error
  '--cz-error-bg': '#450a0a',
  '--cz-error-text': '#fca5a5',
  '--cz-error-border': '#7f1d1d',

  // Semantic - Info
  '--cz-info-bg': '#1e3a5f',
  '--cz-info-text': '#93c5fd',
  '--cz-info-border': '#1e40af',

  // Typography
  '--cz-font-family': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

  // Border radius
  '--cz-radius-sm': '4px',
  '--cz-radius-md': '8px',
  '--cz-radius-full': '9999px',

  // Shadows
  '--cz-shadow-sm': '0 1px 3px rgba(0,0,0,0.3)',
  '--cz-shadow-md': '0 2px 6px rgba(0,0,0,0.4)',

  // Overlay
  '--cz-overlay': 'rgba(0,0,0,0.6)',
};
