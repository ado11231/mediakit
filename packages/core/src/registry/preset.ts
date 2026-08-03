import { Registry } from './registry.js';

export interface Preset {
  width: number;
  height: number;
  /** Selects the renderer. Internal to core, and never a field in a spec. */
  renderer: 'still' | 'video';
  /** Default token multiplier for this canvas. A config `scale` overrides it. */
  scale: number;
}

export const createPresetRegistry = (): Registry<Preset> => new Registry<Preset>('preset');

/**
 * Social stills only. Listing presets (`ios-6.9`, `ipad-13`, `play-feature`, and the web
 * channels) land at M2 alongside `check`, since a preset whose store constraints are not
 * yet enforceable would suggest a guarantee that does not exist.
 *
 * The 2.5 multiplier comes from the reference measurement: a design system's `3xl` spacing
 * of 32 is a correct margin on a 390pt viewport and 3% of a 1080px canvas.
 */
export const SOCIAL_PRESETS: Readonly<Record<string, Preset>> = {
  'ig-portrait': { width: 1080, height: 1350, renderer: 'still', scale: 2.5 },
  'ig-square': { width: 1080, height: 1080, renderer: 'still', scale: 2.5 },
  story: { width: 1080, height: 1920, renderer: 'still', scale: 2.5 },
  'li-portrait': { width: 1080, height: 1350, renderer: 'still', scale: 2.5 },
};
