import { colorToken, defineBlock, h, spaceToken, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * A single emphasised number with a short label beneath it, the unit on a "stats that matter"
 * slide. `value` is a string rather than a number so formatting (currency, suffixes, decimals)
 * stays with the spec author, where it is reviewable, rather than baked into the block.
 */
export const Stat = defineBlock({
  schema: z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().default('ink'),
    labelColor: z.string().default('inkMuted'),
    size: z.string().default('display'),
    labelSize: z.string().default('caption'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: ({ value, label, color, labelColor, size, labelSize, align }, { tokens }) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems:
            align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          gap: spaceToken(tokens, 'xs'),
        },
      },
      h(
        'div',
        {
          style: {
            ...typeStyle(typeToken(tokens, size)),
            fontFamily: tokens.font.display.family,
            color: colorToken(tokens, color),
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
          },
        },
        value,
      ),
      h(
        'div',
        {
          style: {
            ...typeStyle(typeToken(tokens, labelSize)),
            fontFamily: tokens.font.body.family,
            color: colorToken(tokens, labelColor),
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          },
        },
        label,
      ),
    ),
});
