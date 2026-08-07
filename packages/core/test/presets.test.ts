import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistries,
  LISTING_PRESETS,
  SOCIAL_PRESETS,
  WEB_PRESETS,
  type Constraint,
} from '../src/index.js';

const hasNoAlpha = (constraints: readonly Constraint[] | undefined): boolean =>
  constraints?.some((c) => c.kind === 'noAlpha') ?? false;

const frameCount = (
  constraints: readonly Constraint[] | undefined,
): { min: number; max: number } | undefined => {
  const c = constraints?.find(
    (x): x is { kind: 'frameCount'; min: number; max: number } => x.kind === 'frameCount',
  );
  return c === undefined ? undefined : { min: c.min, max: c.max };
};

describe('social presets', () => {
  it('ships the four social surfaces with no channel constraints', () => {
    const names = Object.keys(SOCIAL_PRESETS).sort();
    expect(names).toEqual(['ig-portrait', 'ig-square', 'li-portrait', 'story']);
    for (const preset of Object.values(SOCIAL_PRESETS)) {
      expect(preset.constraints).toBeUndefined();
    }
  });
});

describe('listing presets', () => {
  it('ships the Apple and Google screenshot sizes from design.md', () => {
    expect(Object.keys(LISTING_PRESETS).sort()).toEqual([
      'ios-6.5',
      'ios-6.9',
      'ipad-13',
      'play-feature',
      'play-phone',
    ]);
  });

  it('omits play-icon, because mediakit renders opaque and a 32-bit-with-alpha icon is a guarantee the renderer cannot meet', () => {
    expect(LISTING_PRESETS['play-icon']).toBeUndefined();
  });

  it('matches the Apple dimensions verified against developer docs in July 2026', () => {
    expect(LISTING_PRESETS['ios-6.9']).toMatchObject({ width: 1320, height: 2868 });
    expect(LISTING_PRESETS['ios-6.5']).toMatchObject({ width: 1284, height: 2778 });
    expect(LISTING_PRESETS['ipad-13']).toMatchObject({ width: 2064, height: 2752 });
  });

  it('marks every Apple preset noAlpha, since App Review rejects transparency', () => {
    for (const name of ['ios-6.9', 'ios-6.5', 'ipad-13']) {
      expect(hasNoAlpha(LISTING_PRESETS[name]?.constraints)).toBe(true);
    }
  });

  it('caps Apple frame counts at 1 to 10 per device type', () => {
    expect(frameCount(LISTING_PRESETS['ios-6.9']?.constraints)).toEqual({ min: 1, max: 10 });
    expect(frameCount(LISTING_PRESETS['ipad-13']?.constraints)).toEqual({ min: 1, max: 10 });
  });

  it('caps Play phone frame counts at 2 to 8 and pins the 2x aspect ratio', () => {
    const play = LISTING_PRESETS['play-phone'];
    expect(frameCount(play?.constraints)).toEqual({ min: 2, max: 8 });
    const ratio = play?.constraints?.find(
      (c): c is { kind: 'aspectRatio'; maxRatio: number } => c.kind === 'aspectRatio',
    );
    expect(ratio?.maxRatio).toBe(2);
  });

  it('marks the Play feature graphic noAlpha (JPEG or 24-bit PNG, no alpha)', () => {
    expect(hasNoAlpha(LISTING_PRESETS['play-feature']?.constraints)).toBe(true);
    expect(LISTING_PRESETS['play-feature']).toMatchObject({ width: 1024, height: 500 });
  });
});

describe('web presets', () => {
  it('ships the four web channels verified against docs in August 2026', () => {
    expect(Object.keys(WEB_PRESETS).sort()).toEqual([
      'cws-marquee',
      'cws-screenshot',
      'github-social',
      'producthunt-gallery',
    ]);
  });

  it('matches GitHub social preview dimensions from GitHub docs', () => {
    expect(WEB_PRESETS['github-social']).toMatchObject({ width: 1280, height: 640 });
    expect(frameCount(WEB_PRESETS['github-social']?.constraints)).toEqual({ min: 1, max: 1 });
  });

  it('matches Product Hunt gallery dimensions and requires a 2-image minimum', () => {
    expect(WEB_PRESETS['producthunt-gallery']).toMatchObject({ width: 1270, height: 760 });
    expect(frameCount(WEB_PRESETS['producthunt-gallery']?.constraints)).toEqual({
      min: 2,
      max: 8,
    });
  });

  it('matches Chrome Web Store screenshot dimensions (1280x800, the preferred size)', () => {
    expect(WEB_PRESETS['cws-screenshot']).toMatchObject({ width: 1280, height: 800 });
    expect(frameCount(WEB_PRESETS['cws-screenshot']?.constraints)).toEqual({ min: 1, max: 5 });
  });

  it('matches Chrome Web Store marquee promo dimensions', () => {
    expect(WEB_PRESETS['cws-marquee']).toMatchObject({ width: 1400, height: 560 });
    expect(frameCount(WEB_PRESETS['cws-marquee']?.constraints)).toEqual({ min: 1, max: 1 });
  });
});

describe('the default registries seed all three families', () => {
  it('exposes social, listing, and web presets without any consumer config', () => {
    const names = createDefaultRegistries().presets.names();
    expect(names).toContain('ig-portrait');
    expect(names).toContain('ios-6.9');
    expect(names).toContain('play-phone');
    expect(names).toContain('github-social');
    expect(names).toContain('cws-screenshot');
  });
});
