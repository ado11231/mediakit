import { colorToken, defineBlock, h, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * Sits between Headline and Body. Defaulting to `ink` rather than `inkMuted` keeps a subhead
 * a secondary headline rather than faded body copy; a design system that wants the muted
 * reading points `color` at `inkMuted` without replacing the block.
 */
export const Subhead = defineBlock({
  schema: z.object({
    text: z.string(),
    color: z.string().default('ink'),
    size: z.string().default('headline'),
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
