import { defineTemplate, type AssetSpec } from '@mediakit/core';

/**
 * A store listing: one frame per thing the app does, each a headline over a device.
 *
 * The device frame appears only when a screen was supplied. `DeviceFrame` reads its `src` from
 * disk at render time, so emitting one that points at a file nobody has rendered yet would
 * scaffold a spec that throws on the first run, and `new` promises the same thing `init` does:
 * a project that renders immediately.
 *
 * `chrome` is `phone-notch` because the screen this frames is a render, which has no status
 * bar of its own. A capture from a real device already has one and wants `phone`. Nothing
 * infers that: a doubled island renders, validates, and uploads.
 *
 * The device is sized against the tightest canvas the spec fans out across, not against the
 * screen's own dimensions. A 6.9 inch screen render is 1320x2868, which is larger than a
 * `play-phone` canvas outright; left intrinsic it pushes the headline off the canvas and every
 * frame renders to the same bytes.
 */
const DEVICE_FRACTION = 0.6;

const deviceSize = (
  canvases: readonly { width: number; height: number }[],
  screen: { width: number; height: number },
): { width: number; height: number } => {
  const width = Math.min(...canvases.map((c) => c.width)) * DEVICE_FRACTION;
  const height = Math.min(...canvases.map((c) => c.height)) * DEVICE_FRACTION;
  const aspect = screen.height / screen.width;

  const fitted = Math.min(width, height / aspect);
  return { width: Math.round(fitted), height: Math.round(fitted * aspect) };
};
export const listing = defineTemplate({
  description: 'App Store and Play listing frames: a headline over a device screen',
  presets: ['ios-6.9', 'play-phone'],
  frames: { min: 1, max: 10, default: 3 },
  wantsScreen: true,
  build: ({ id, presets, canvases, frames, screen }): AssetSpec => ({
    id,
    preset: presets.length === 1 ? (presets[0] as string) : [...presets],
    frames: Array.from({ length: frames }, (_, index) => ({
      layout: 'centered',
      blocks: [
        {
          type: 'Background',
          props: { gradient: { from: 'surface', to: 'canvas', angle: 180 } },
        },
        {
          type: 'Headline',
          props: {
            text: `Frame ${index + 1}: what this screen does for them`,
            size: 'title',
            align: 'center',
          },
        },
        ...(screen === undefined
          ? [
              {
                type: 'Body',
                props: {
                  text: 'Replace this with a DeviceFrame once you have a screen to show.',
                  align: 'center',
                },
              },
            ]
          : [
              {
                type: 'DeviceFrame',
                props: {
                  chrome: 'phone-notch',
                  src: screen.path,
                  ...deviceSize(canvases, screen),
                },
              },
            ]),
      ],
    })),
  }),
});
