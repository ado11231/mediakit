import { colorToken, defineBlock, h, radiusToken, spaceToken, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { alignItems, typeStyle } from '../style.js';

/**
 * A pill-shaped call to action. `background` and `color` are open strings against the color
 * tokens so a design system whose button inverts (ink on canvas) does not have to fork the
 * block. `align` controls the pill's position within its column via `alignSelf`, since the
 * pill must hug its content rather than stretch to the column width.
 */
export const CTA = defineBlock({
  schema: z.object({
    text: z.string(),
    background: z.string().default('accent'),
    color: z.string().default('canvas'),
    size: z.string().default('callout'),
    radius: z.string().default('full'),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  still: ({ text, background, color, size, radius, align }, { tokens }) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignSelf: alignItems(align),
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            ...typeStyle(typeToken(tokens, size)),
            fontFamily: tokens.font.display.family,
            fontWeight: 700,
            color: colorToken(tokens, color),
            backgroundColor: colorToken(tokens, background),
            borderRadius: radiusToken(tokens, radius),
            paddingTop: spaceToken(tokens, 'sm'),
            paddingBottom: spaceToken(tokens, 'sm'),
            paddingLeft: spaceToken(tokens, 'xl'),
            paddingRight: spaceToken(tokens, 'xl'),
          },
        },
        text,
      ),
    ),
});
