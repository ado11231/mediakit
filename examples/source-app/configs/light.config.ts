import base from '../mediakit.config.ts';

/**
 * The light half of the store pair the README composites, and the theme the launch carousel
 * renders in. Same specs, same custom block, same custom layout, same custom preset, same copy.
 * Only the four surface colours differ, which is the claim the project makes in one image:
 * listing page is `surface`, type is `ink`, and this file swaps both.
 *
 * `accent` is inherited rather than restated. A second literal here would be the exact drift the
 * token contract exists to prevent: the two themes would agree until someone changed one.
 *
 * Selected with `mediakit render ... --config configs/light.config.ts`, which is also how the
 * example exercises that flag from outside core.
 */
export default {
  ...base,
  tokens: {
    ...base.tokens,
    color: {
      ...base.tokens.color,
      canvas: '#FFFFFF',
      surface: '#F1F4F7',
      ink: '#0B0E14',
      inkMuted: '#5A6472',
    },
  },
};
