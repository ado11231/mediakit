import type { TypeStyle } from './contract.js';

/**
 * Authored at design-system scale, meaning the values a real app's tokens would carry for
 * a phone viewport, not canvas pixels. The preset supplies the multiplier that lifts them
 * onto a 1080px canvas.
 *
 * This is the load-bearing detail. If defaults were authored at canvas size while a
 * consumer's imported tokens were not, the two would need different `scale` values to look
 * alike, and the default config would be the one thing in the system that ignores the
 * scale contract.
 */

export const DEFAULT_COLOR: Record<string, string> = {
  accent: '#2563EB',
  canvas: '#0B0E14',
  surface: '#151A23',
  ink: '#F5F7FA',
  inkMuted: '#9AA4B2',
  positive: '#34D399',
  negative: '#F87171',
};

export const DEFAULT_SPACE: Record<string, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
};

/** Not scaled. See `resolveTokens` for why, and for the open question at M2. */
export const DEFAULT_RADIUS: Record<string, number> = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

/**
 * Every `fontWeight` here must be a weight `DEFAULT_FONT` actually ships, since satori
 * substitutes a missing weight silently rather than failing. The bundled family is two
 * weights, so this scale is expressed in 400 and 700 alone. A consumer supplying a font
 * with more weights overrides `type` wholesale.
 */
export const DEFAULT_TYPE: Record<string, TypeStyle> = {
  display: { fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em' },
  title: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' },
  headline: { fontSize: 22, fontWeight: 700, lineHeight: 1.25 },
  body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
  callout: { fontSize: 15, fontWeight: 700, lineHeight: 1.4 },
  caption: { fontSize: 13, fontWeight: 400, lineHeight: 1.35, letterSpacing: '0.02em' },
};

export const DEFAULT_SCALE = 1;
