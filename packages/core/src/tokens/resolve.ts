import { MediakitError } from '../errors.js';
import type { FontTokens, ResolvedTokens, TokensInput, TypeStyle } from './contract.js';
import { DEFAULT_FONT } from './default-font.js';
import { DEFAULT_COLOR, DEFAULT_RADIUS, DEFAULT_SPACE, DEFAULT_TYPE } from './defaults.js';

const mapValues = <A, B>(
  source: Readonly<Record<string, A>>,
  transform: (value: A) => B,
): Record<string, B> =>
  Object.fromEntries(Object.entries(source).map(([key, value]) => [key, transform(value)]));

/**
 * `lineHeight` is a unitless multiple and `letterSpacing` is em-relative, so both survive
 * the jump to a larger canvas unchanged. Only `fontSize` is an absolute length.
 */
const scaleType = (style: TypeStyle, scale: number): TypeStyle => ({
  ...style,
  fontSize: style.fontSize * scale,
});

/**
 * Supplying one family fills both roles from it, so a config that only cares about body
 * copy does not have to name the same font twice. Supplying neither falls back to the
 * bundled default, which is what makes `color.accent` the only required token.
 */
const resolveFont = (input: TokensInput['font']): FontTokens => {
  const { display, body } = input ?? {};
  const fallback = display ?? body ?? DEFAULT_FONT;

  return { display: display ?? fallback, body: body ?? fallback };
};

/**
 * Applies the one explicit multiplier from the token contract. An app's spacing and type
 * scales are calibrated to a viewport roughly a third the width of the smallest canvas
 * mediakit targets, so piping them in raw produces output that looks like a bug in mediakit.
 *
 * Colour is scale invariant and passes through. Radius does too, which is the contract as
 * written and is worth revisiting at M2: a 40px phone-screen corner and a 40px poster corner
 * are not the same gesture, and `DeviceFrame` is where that first bites.
 *
 * Config `scale` wins over the preset's default, since the preset only proposes one.
 */
export const resolveTokens = (input: TokensInput, presetScale: number): ResolvedTokens => {
  const scale = input.scale ?? presetScale;

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new MediakitError(
      `Token scale must be a finite number greater than zero, received ${String(scale)}.`,
    );
  }

  return {
    color: { ...DEFAULT_COLOR, ...input.color },
    font: resolveFont(input.font),
    type: mapValues({ ...DEFAULT_TYPE, ...input.type }, (style) => scaleType(style, scale)),
    space: mapValues({ ...DEFAULT_SPACE, ...input.space }, (value) => value * scale),
    radius: { ...DEFAULT_RADIUS, ...input.radius },
  };
};
