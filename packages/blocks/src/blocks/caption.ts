import { colorToken, defineBlock, h, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * Smaller and quieter than Body: a figure caption, a source line, an "image 3 of 5" marker.
 * Defaults to the `caption` type token and `inkMuted`, so a frame's caption is styled by the
 * contract rather than by a number someone picked here.
 */
export const Caption = defineBlock({
  schema: z.object({
    text: z.string(),
    color: z.string().default('inkMuted'),
    size: z.string().default('caption'),
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
