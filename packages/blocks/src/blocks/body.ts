import { colorToken, defineBlock, h, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

export const Body = defineBlock({
  schema: z.object({
    text: z.string(),
    color: z.string().default('inkMuted'),
    size: z.string().default('body'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: ({ text, color, size, align }, { tokens }) =>
    h(
      'div',
      {
        style: {
          ...typeStyle(typeToken(tokens, size)),
          fontFamily: tokens.font.body.family,
          color: colorToken(tokens, color),
          textAlign: align,
        },
      },
      text,
    ),
});
