import { defineLayout, h, spaceToken, type Element, type Style } from '@mediakit/core';

/**
 * `flexBasis: 0` alongside `flexGrow: 1` is what makes the halves equal regardless of
 * content. Without it flex sizes each column from its intrinsic width, so a long headline
 * silently steals space from the other side.
 *
 * `minWidth: 0` is the companion fix. A flex item refuses to shrink below its minimum
 * content width by default, so without it a column widens to fit its longest unbreakable
 * word and pushes the other column off its half.
 *
 * Neither helps when a single word is wider than the column can ever be. Display-size type
 * in a half-width column is that case, and the answer is authoring: point the block at a
 * smaller type token rather than expecting the layout to rescue it.
 */
const column = (gap: number): Style => ({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  flexBasis: 0,
  minWidth: 0,
  justifyContent: 'center',
  gap,
});

export const split = defineLayout({
  slots: ['left', 'right'],
  still: ({ slots }, { tokens }) => {
    const gap = spaceToken(tokens, 'lg');
    const side = (name: string): readonly Element[] => slots[name] ?? [];

    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          gap: spaceToken(tokens, '2xl'),
          padding: spaceToken(tokens, '3xl'),
        },
      },
      h('div', { style: column(gap) }, ...side('left')),
      h('div', { style: column(gap) }, ...side('right')),
    );
  },
});
