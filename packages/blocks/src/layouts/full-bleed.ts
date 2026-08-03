import { defineLayout, h } from '@mediakit/core';

/**
 * Edge to edge, no padding, children stretched to the canvas. This is the layout that had
 * zero coverage in the reference: no spec ever used it, so it had never been rendered by
 * anything at all.
 *
 * Its purpose is a block that must reach the canvas edge, which today means a background
 * fill and at M2 means an image. Copy laid directly on a full-bleed frame belongs in a
 * block that owns its own inset, since this layout deliberately supplies none.
 */
export const fullBleed = defineLayout({
  slots: [],
  still: ({ blocks }) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        },
      },
      ...blocks,
    ),
});
