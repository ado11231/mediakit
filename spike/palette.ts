/**
 * Every value here becomes a token at M1. It is centralised in one file rather than
 * inlined so the diff that introduces the token contract is a rename, not a hunt.
 * A block reaching for a hex directly is what CLAUDE.md invariant 9 forbids.
 */
export const palette = {
  canvas: '#0B0E14',
  canvasAccent: '#131824',
  ink: '#F5F7FA',
  inkMuted: '#8A94A6',
  accent: '#4F8CFF',
  accentSoft: 'rgba(79,140,255,0.14)',
  bezel: '#1C222E',
  screen: '#0F131C',
  surface: '#161C28',
  positive: '#3ECF8E',
} as const;

export const font = {
  body: 'Geist',
} as const;
