import { defineTemplate, type AssetSpec } from '@mediakit/core';

/**
 * A fake app screen, built from blocks, at the pixel size of a real device.
 *
 * This is the half of a listing that cannot be automated any other way without running the
 * app. Composing it from blocks instead of capturing it costs exact fidelity and buys the
 * thing the capture can never have: it is a spec, so it re-renders deterministically when a
 * token changes, and the screenshot going to App Review is reproducible rather than something
 * somebody took on a Tuesday.
 *
 * Every string here is invented sample data, which is the rule the example directory lives
 * under too: a real customer name in a marketing asset is a leak, not a bug.
 */
export const screen = defineTemplate({
  description: 'A fake app screen from blocks, sized for a device, to frame in a listing',
  // The 6.9 inch listing canvas is the iPhone 16 Pro Max screen at 3x: 440x956 points times
  // three is 1320x2868, the exact size Apple asks a 6.9 inch screenshot to be. So the screen
  // being framed and the listing framing it share dimensions, and no separate preset is needed.
  presets: ['ios-6.9'],
  frames: { min: 1, max: 5, default: 1 },
  build: ({ id, presets, frames }): AssetSpec => ({
    id,
    preset: presets.length === 1 ? (presets[0] as string) : [...presets],
    frames: Array.from({ length: frames }, () => ({
      layout: 'screen',
      blocks: [
        { type: 'Background', props: { color: 'surface' } },
        { type: 'Eyebrow', props: { text: 'Today', color: 'accent' } },
        { type: 'Headline', props: { text: '6 things on the list', size: 'title' } },
        { type: 'Stat', props: { value: '$1,840', label: 'Invoiced this week' } },
        {
          type: 'BulletList',
          props: {
            gap: 'lg',
            items: [
              '08:00  First item on the list',
              '09:45  Second item',
              '11:30  Third item',
              '13:15  Fourth item',
            ],
          },
        },
        { type: 'CTA', props: { text: 'Add another' } },
      ],
    })),
  }),
});
