import { Registry } from './registry.js';

/**
 * A rule a distribution channel enforces on uploaded images, attached to the preset it
 * applies to so `check` can verify it without scattering assertions through render code.
 *
 * A closed union of kinds is deliberate here, unlike the open strings in the spec schema.
 * A constraint kind is core's own contract with `check`, not a capability a consumer extends
 * by registering; adding a new store rule is a core change, the way supporting a new renderer
 * would be. See invariant 3 in CLAUDE.md, which governs spec fields, not internal core types.
 *
 * The same logic is why these names are not exported through the spec: a spec never names a
 * constraint, it names a preset, and the preset carries its constraints.
 */
export type Constraint =
  | { readonly kind: 'noAlpha' }
  | { readonly kind: 'frameCount'; readonly min: number; readonly max: number }
  | { readonly kind: 'aspectRatio'; readonly maxRatio: number };

export interface Preset {
  width: number;
  height: number;
  /** Selects the renderer. Internal to core, and never a field in a spec. */
  renderer: 'still' | 'video';
  /** Default token multiplier for this canvas. A config `scale` overrides it. */
  scale: number;
  /**
   * Channel rules `check` enforces against the rendered output and the spec. Empty for social
   * presets, which have no channel to answer to.
   */
  constraints?: readonly Constraint[];
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

/**
 * App store and Play store listing presets, dimensions verified against Apple and Google
 * developer docs in July 2026 (see design.md).
 *
 * `scale` stays 2.5 across listing sizes rather than tracking canvas width, because a listing
 * frame is mostly a device-framed screenshot and the type scale only touches its caption. A
 * taller or wider canvas does not by itself justify larger captions, and an inferred scale was
 * rejected in design.md for being silent when wrong. A consumer overrides per preset if the
 * proposal reads too small on a given canvas.
 *
 * `play-icon` (512x512, 32-bit PNG with alpha) is intentionally omitted: it is an icon, not a
 * screenshot, and mediakit's render composites on an opaque background, so a preset that
 * demanded alpha would be a guarantee the renderer cannot meet. `check` cannot make a
 * rendered PNG transparent after the fact, and pretending otherwise is worse than listing it.
 */
export const LISTING_PRESETS: Readonly<Record<string, Preset>> = {
  'ios-6.9': {
    width: 1320,
    height: 2868,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'noAlpha' }, { kind: 'frameCount', min: 1, max: 10 }],
  },
  'ios-6.5': {
    width: 1284,
    height: 2778,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'noAlpha' }, { kind: 'frameCount', min: 1, max: 10 }],
  },
  'ipad-13': {
    width: 2064,
    height: 2752,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'noAlpha' }, { kind: 'frameCount', min: 1, max: 10 }],
  },
  'play-phone': {
    width: 1080,
    height: 1920,
    renderer: 'still',
    scale: 2.5,
    constraints: [
      { kind: 'frameCount', min: 2, max: 8 },
      { kind: 'aspectRatio', maxRatio: 2 },
    ],
  },
  'play-feature': {
    width: 1024,
    height: 500,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'noAlpha' }],
  },
};

/**
 * Web channel presets, dimensions verified against each channel's official docs in August 2026
 * (see design.md). GitHub supports alpha; Product Hunt requires a 2-image gallery minimum;
 * Chrome Web Store screenshots accept 1280x800 or 640x400 (the larger is preferred); the CWS
 * marquee promo is a single 1400x560 tile.
 *
 * `scale` stays 2.5 for consistency with the listing presets: a wider canvas does not by
 * itself justify larger type, and a consumer overrides per preset if it reads too small.
 */
export const WEB_PRESETS: Readonly<Record<string, Preset>> = {
  'github-social': {
    width: 1280,
    height: 640,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'frameCount', min: 1, max: 1 }],
  },
  'producthunt-gallery': {
    width: 1270,
    height: 760,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'frameCount', min: 2, max: 8 }],
  },
  'cws-screenshot': {
    width: 1280,
    height: 800,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'frameCount', min: 1, max: 5 }],
  },
  'cws-marquee': {
    width: 1400,
    height: 560,
    renderer: 'still',
    scale: 2.5,
    constraints: [{ kind: 'frameCount', min: 1, max: 1 }],
  },
};
