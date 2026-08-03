import { defineLayout, h, spaceToken } from '@mediakit/core';

/**
 * `justifyContent` is the whole point of this layout. The reference implementation set a
 * flex column with padding and no distribution, so content piled into the top fifth of a
 * 1350px canvas and the layout looked unfinished rather than broken. Anchoring to the end
 * is the arrangement a stacked poster actually wants: the canvas breathes above the copy.
 */
export const stack = defineLayout({
  slots: [],
  still: ({ blocks }, { tokens }) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          gap: spaceToken(tokens, 'lg'),
          padding: spaceToken(tokens, '3xl'),
        },
      },
      ...blocks,
    ),
});
