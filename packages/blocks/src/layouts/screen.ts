import { defineLayout, h, spaceToken } from '@mediakit/core';

/**
 * A phone screen: content hung from the top of the canvas rather than floating in it.
 *
 * `stack` anchors to the end, which is right for a poster and wrong for an app. An app screen
 * fills downward from the status bar, and a stacked one reads as a poster of an app rather
 * than as an app.
 *
 * The extra top padding is island headroom. `phone-notch` draws a Dynamic Island over the top
 * of whatever it frames, so a screen composed for it has to clear one; a screen shown without
 * chrome loses a little air and nothing else.
 */
export const screen = defineLayout({
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
          gap: spaceToken(tokens, 'xl'),
          paddingTop: spaceToken(tokens, '3xl') + spaceToken(tokens, 'xl'),
          paddingLeft: spaceToken(tokens, 'xl'),
          paddingRight: spaceToken(tokens, 'xl'),
          paddingBottom: spaceToken(tokens, '3xl'),
        },
      },
      ...blocks,
    ),
});
