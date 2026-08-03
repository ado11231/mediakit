import { defineLayout, h, spaceToken } from '@mediakit/core';

export const centered = defineLayout({
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
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: spaceToken(tokens, 'xl'),
          padding: spaceToken(tokens, '3xl'),
        },
      },
      ...blocks,
    ),
});
