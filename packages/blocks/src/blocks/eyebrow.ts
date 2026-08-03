import { colorToken, defineBlock, h, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * `transform` defaults to uppercase because that is what makes an eyebrow an eyebrow rather
 * than small body copy. It is a prop rather than a hardcoded value so a design system whose
 * kickers are sentence case does not have to replace the block to get one.
 */
export const Eyebrow = defineBlock({
  schema: z.object({
    text: z.string(),
    color: z.string().default('accent'),
    size: z.string().default('caption'),
    transform: z.enum(['uppercase', 'none']).default('uppercase'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: ({ text, color, size, transform, align }, { tokens }) =>
    h(
      'div',
      {
        style: {
          ...typeStyle(typeToken(tokens, size)),
          fontFamily: tokens.font.body.family,
          color: colorToken(tokens, color),
          textTransform: transform,
          textAlign: align,
        },
      },
      text,
    ),
});
