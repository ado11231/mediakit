import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistries,
  LISTING_PRESETS,
  SOCIAL_PRESETS,
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

describe('the default registries seed both families', () => {
  it('exposes social and listing presets without any consumer config', () => {
    const names = createDefaultRegistries().presets.names();
    expect(names).toContain('ig-portrait');
    expect(names).toContain('ios-6.9');
    expect(names).toContain('play-phone');
  });
});
