import {
  colorToken,
  defineBlock,
  defineConfig,
  defineLayout,
  h,
  radiusToken,
  spaceToken,
  typeToken,
} from '@mediakit/core';
import { z } from 'zod';

const card = defineBlock({
  schema: z.object({
    tier: z.string(),
    price: z.string(),
    period: z.string().optional(),
    feature: z.string(),
  }),
  /**
   * `period` renders under the price at caption size instead of being part of the `price`
   * string. "$12/mo" at display size wraps mid-word in a split column; "$12" never does,
   * and a stacked period cannot overflow the card however narrow the column gets.
   */
  still: ({ tier, price, period, feature }, { tokens }) => {
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
            flexDirection: 'column',
            gap: spaceToken(tokens, 'xs'),
          },
        },
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
        period === undefined
          ? undefined
          : h(
              'div',
              {
                style: {
                  display: 'flex',
                  ...typeStyle(
                    typeToken(tokens, 'caption'),
                    tokens.font.body.family,
                    colorToken(tokens, 'inkMuted'),
                  ),
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                },
              },
              period,
            ),
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
  slots: ['headline', 'card', 'footer'],
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
    const footer = slots.footer ?? [];
    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: spaceToken(tokens, '3xl'),
          gap,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'row',
            flexGrow: 1,
            alignItems: 'center',
            gap: spaceToken(tokens, '2xl'),
          },
        },
        h('div', { style: columnStyle }, ...(slots.headline ?? [])),
        h('div', { style: columnStyle }, ...(slots.card ?? [])),
      ),
      footer.length > 0
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
            },
            ...footer,
          )
        : undefined,
    );
  },
});

/**
 * The app screen the store frames capture. Top-anchored rather than centered, because an app
 * hangs its content from the status bar rather than floating it mid-screen. The extra top
 * padding is island headroom: `phone-notch` draws the Dynamic Island over the top of this
 * canvas, so the first block has to clear it.
 */
const screen = defineLayout({
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

/**
 * Two screenshots on one canvas. Each slot is a column: the listing, clipped to its upper
 * portion so the headline and the top of the phone stay readable at README size, then a
 * label. The DeviceFrame is sized to the full listing aspect; this clip is the crop.
 * Rounding on the clip picks up `field` rather than the GitHub page colour.
 */
const pair = defineLayout({
  slots: ['left', 'right'],
  still: ({ slots }, { tokens }) => {
    const radius = radiusToken(tokens, 'lg');
    const pad = spaceToken(tokens, 'sm');
    const gap = spaceToken(tokens, 'md');
    const labelGap = spaceToken(tokens, 'sm');

    const cell = (name: string) => {
      const items = slots[name] ?? [];
      const screenshot = items[0];
      const labels = items.slice(1);
      const imageHeight =
        screenshot !== undefined && typeof screenshot.props.style?.height === 'number'
          ? screenshot.props.style.height
          : 0;
      const imageWidth =
        screenshot !== undefined && typeof screenshot.props.style?.width === 'number'
          ? screenshot.props.style.width
          : 0;
      // Centered listing portraits put the phone UI in the middle of the canvas, so 40% is
      // padding plus the island. 55% reaches Today, the job count, and the $1,840 stat.
      const cropHeight = Math.round(imageHeight * 0.55);

      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: imageWidth,
            gap: labelGap,
            alignItems: 'stretch',
          },
        },
        screenshot !== undefined
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  overflow: 'hidden',
                  borderRadius: radius,
                  width: imageWidth,
                  height: cropHeight,
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                },
              },
              screenshot,
            )
          : undefined,
        labels.length > 0
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  width: imageWidth,
                  justifyContent: 'center',
                },
              },
              ...labels,
            )
          : undefined,
      );
    };

    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          gap,
          padding: pad,
        },
      },
      cell('left'),
      cell('right'),
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
    /**
     * The dark half of the store pair. `configs/light.config.ts` spreads this and swaps the
     * four surface colours, which is the whole difference between the two screenshots the
     * README composites: same spec, same blocks, same layout, different tokens.
     *
     * `accent` is a teal dark enough to clear 3:1 against white and light enough to clear it
     * against the dark canvas, since one value has to carry both themes.
     *
     * `bezel` is black rather than the default, which is the same value as `canvas` and would
     * render the device as a phone-shaped hole with only its shadow to separate it. Store
     * frames stand the device on `surface` so the bezel still separates on both themes.
     *
     * `field` is a deep desaturated teal pulled from `accent`, the ground the README pair
     * sits on.
     */
    color: {
      accent: '#0D9488',
      bezel: '#0B0E14',
      field: '#1A3D3A',
    },
  },
  blocks: { PricingCard: card },
  layouts: { 'pricing-split': pricingSplit, pair, screen },
  presets: {
    'preview-card': {
      width: 1080,
      height: 1350,
      renderer: 'still',
      scale: 2.5,
    },
    /**
     * 2x the README's 560px pair image. Sized here rather than downscaled later so the
     * composite the README embeds is itself a spec output, not a post-processed screenshot.
     * Height is padding plus two cropped listing cards (top 55%) plus labels. Scale 2 so
     * Caption type reads at the README display size; this canvas has no display type.
     */
    'readme-pair': {
      width: 1120,
      height: 720,
      renderer: 'still',
      scale: 2,
    },
    /**
     * An iPhone 15 Pro screen in device pixels. The store spec frames the PNG this renders
     * inside a DeviceFrame, so the screenshot going to App Review is itself an asset built
     * from a spec and tokens rather than a capture someone took and forgot how to reproduce.
     * Scale 3 because this is a 3x display: tokens are authored in points, and 3 is the
     * multiplier that makes body type render at the size the OS would render it.
     */
    'app-screen': {
      width: 1170,
      height: 2532,
      renderer: 'still',
      scale: 3,
    },
  },
  brandRules: {
    noExclamations: true,
    maxHeadline: 60,
  },
});
