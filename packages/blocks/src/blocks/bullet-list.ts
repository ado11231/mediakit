import { colorToken, defineBlock, h, spaceToken, typeToken } from '@mediakit/core';
import { z } from 'zod';
import { typeStyle } from '../style.js';

/**
 * The marker is a rounded div rather than a bullet glyph, because a glyph would depend on
 * the loaded font containing it and satori substitutes silently when it does not. A div is
 * also the only way to colour the marker independently of the text.
 */
export const BulletList = defineBlock({
  schema: z.object({
    items: z.array(z.string()).min(1),
    color: z.string().default('inkMuted'),
    markerColor: z.string().default('accent'),
    size: z.string().default('body'),
    gap: z.string().default('sm'),
  }),
  still: ({ items, color, markerColor, size, gap }, { tokens }) => {
    const style = typeToken(tokens, size);
    const marker = Math.round(style.fontSize * 0.28);
    // Centred against the first line box rather than the whole item, so a marker beside a
    // wrapped two-line bullet still sits next to its first line instead of drifting to the
    // middle of the block.
    const markerOffset = Math.round((style.fontSize * style.lineHeight - marker) / 2);

    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: spaceToken(tokens, gap) } },
      ...items.map((item) =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spaceToken(tokens, gap),
            },
          },
          h('div', {
            style: {
              display: 'flex',
              width: marker,
              height: marker,
              marginTop: markerOffset,
              borderRadius: marker,
              backgroundColor: colorToken(tokens, markerColor),
              flexShrink: 0,
            },
          }),
          h(
            'div',
            {
              style: {
                ...typeStyle(style),
                fontFamily: tokens.font.body.family,
                color: colorToken(tokens, color),
              },
            },
            item,
          ),
        ),
      ),
    );
  },
});
