import { colorToken, defineBlock, h, spaceToken, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * A single emphasised number with a short label beneath it, the unit on a "stats that matter"
 * slide. `value` is a string rather than a number so formatting (currency, suffixes, decimals)
 * stays with the spec author, where it is reviewable, rather than baked into the block.
 *
 * `transform` defaults to `none` while `labelTransform` defaults to `uppercase`. The label is
 * a caption and reads as one in caps; the value is copy the author typed. Uppercasing it by
 * default rewrote `5 min` to `5 MIN` with no way to opt out, which is a content change wearing
 * a styling change's clothes: a price or a product name ships wrong and nothing reports it.
 */
export const Stat = defineBlock({
  schema: z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().default('ink'),
    labelColor: z.string().default('inkMuted'),
    size: z.string().default('display'),
    labelSize: z.string().default('caption'),
    transform: z.enum(['uppercase', 'none']).default('none'),
    labelTransform: z.enum(['uppercase', 'none']).default('uppercase'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: (
    { value, label, color, labelColor, size, labelSize, transform, labelTransform, align },
    { tokens },
  ) =>
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
            textTransform: transform,
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
            textTransform: labelTransform,
          },
        },
        label,
      ),
    ),
});
