import {
  colorToken,
  defineBlock,
  defineConfig,
  defineLayout,
  h,
  spaceToken,
  typeToken,
} from '@mediakit/core';
import { z } from 'zod';

const card = defineBlock({
  schema: z.object({
    tier: z.string(),
    price: z.string(),
    feature: z.string(),
  }),
  still: ({ tier, price, feature }, { tokens }) => {
    const ring = spaceToken(tokens, 'xs');
    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: spaceToken(tokens, 'sm'),
          padding: spaceToken(tokens, 'xl'),
          borderRadius: spaceToken(tokens, 'lg'),
          backgroundColor: colorToken(tokens, 'surface'),
          boxShadow: `0 0 0 ${ring}px ${colorToken(tokens, 'accent')}`,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            ...typeToken(tokens, 'callout'),
            fontFamily: tokens.font.display.family,
            color: colorToken(tokens, 'accent'),
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          },
        },
        tier,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            ...typeStyle(
              typeToken(tokens, 'display'),
              tokens.font.display.family,
              colorToken(tokens, 'ink'),
            ),
          },
        },
        price,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            ...typeStyle(
              typeToken(tokens, 'body'),
              tokens.font.body.family,
              colorToken(tokens, 'inkMuted'),
            ),
          },
        },
        feature,
      ),
    );
  },
});

const pricingSplit = defineLayout({
  slots: ['headline', 'card'],
  still: ({ slots }, { tokens }) => {
    const gap = spaceToken(tokens, 'lg');
    const columnStyle = {
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      justifyContent: 'center',
      gap,
    } as const;
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
      h('div', { style: columnStyle }, ...(slots.headline ?? [])),
      h('div', { style: columnStyle }, ...(slots.card ?? [])),
    );
  },
});

const typeStyle = (style: ReturnType<typeof typeToken>, family: string, color: string) => ({
  ...style,
  fontFamily: family,
  color,
});

export default defineConfig({
  tokens: {
    color: { accent: '#7C3AED' },
  },
  blocks: { PricingCard: card },
  layouts: { 'pricing-split': pricingSplit },
  presets: {
    'preview-card': {
      width: 1080,
      height: 1350,
      renderer: 'still',
      scale: 2.5,
    },
  },
});
