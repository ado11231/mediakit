import { defineTemplate, type AssetSpec } from '@mediakit/core';

/**
 * A social carousel: an eyebrow, a headline, a line of body, and a page marker per frame.
 *
 * The marker is written out per frame rather than derived. `RenderContext` carries `frameIndex`
 * and `frameCount` and a custom block could read them, but a built-in that numbered itself
 * would silently renumber every committed PNG the moment a frame was inserted, and the diff
 * would say nothing about why. Carousel continuity is M4, and it needs deciding rather than
 * defaulting.
 */
export const carousel = defineTemplate({
  description: 'A social carousel: one point per frame, numbered',
  presets: ['ig-portrait'],
  frames: { min: 2, max: 20, default: 5 },
  build: ({ id, presets, frames }): AssetSpec => ({
    id,
    preset: presets.length === 1 ? (presets[0] as string) : [...presets],
    frames: Array.from({ length: frames }, (_, index) => ({
      layout: 'stack',
      blocks: [
        { type: 'Background', props: { color: 'canvas' } },
        { type: 'Eyebrow', props: { text: 'The series title' } },
        {
          type: 'Headline',
          props: { text: index === 0 ? 'The hook that earns the swipe' : `Point ${index + 1}` },
        },
        {
          type: 'Body',
          props: { text: 'One sentence saying the thing. Two at the very most.' },
        },
        ...(index === frames - 1
          ? [{ type: 'CTA', props: { text: 'What they should do next' } }]
          : []),
        {
          type: 'Caption',
          props: {
            text: `${String(index + 1).padStart(2, '0')} / ${String(frames).padStart(2, '0')}`,
          },
        },
      ],
    })),
  }),
});
