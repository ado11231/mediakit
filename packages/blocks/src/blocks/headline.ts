import { colorToken, defineBlock, h, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * `color` and `size` are open strings resolved against the token contract rather than
 * enums, for the same reason the spec's capability fields are: a design system that names
 * its base ink `foreground` must work without patching this package.
 */
export const Headline = defineBlock({
  schema: z.object({
    text: z.string(),
    color: z.string().default('ink'),
    size: z.string().default('display'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: ({ text, color, size, align }, { tokens }) =>
    h(
      'div',
      {
        style: {
          ...typeStyle(typeToken(tokens, size)),
          fontFamily: tokens.font.display.family,
          color: colorToken(tokens, color),
          textAlign: align,
        },
      },
      text,
    ),
});
