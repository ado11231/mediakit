import type { Style, TypeStyle } from '@mediakit/core';

/**
 * A `TypeStyle` is the token contract's shape; a `Style` is what satori reads. Keeping the
 * translation in one place is what stops a block from reaching past the contract and
 * hardcoding a size, which is invariant 9.
 *
 * `textTransform: 'none'` is dropped rather than emitted, since satori treats the absent
 * property and the explicit default identically and omitting it keeps the SVG smaller.
 */
export const typeStyle = (style: TypeStyle): Style => ({
  fontSize: style.fontSize,
  fontWeight: style.fontWeight,
  lineHeight: style.lineHeight,
  ...(style.letterSpacing === undefined ? {} : { letterSpacing: style.letterSpacing }),
  ...(style.textTransform === undefined || style.textTransform === 'none'
    ? {}
    : { textTransform: style.textTransform }),
});

export type Align = 'left' | 'center' | 'right';

export const alignItems = (align: Align): string =>
  align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
