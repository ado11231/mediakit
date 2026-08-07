import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkAsset,
  checkSpec,
  createDefaultRegistries,
  defineConfig,
  parsePng,
  parseSpec,
} from '../src/index.js';

const file = 'launch.spec.json';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * An IHDR and nothing else. `checkAsset` reads headers and walks chunk types, so a body-less
 * PNG exercises every constraint without committing a fixture per dimension the store rules
 * need to reject.
 */
const fakePng = (width: number, height: number, colorType: number): Buffer => {
  const header = Buffer.alloc(33);
  PNG_SIG.copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.writeUInt8(colorType, 25);
  return header;
};

const spec = (frames: unknown[]): ReturnType<typeof parseSpec> =>
  parseSpec({ id: 'launch', preset: 'ig-portrait', frames }, file);

describe('checkSpec brand rules', () => {
  it('reports an exclamation when noExclamations is on', () => {
    const violations = checkSpec(
      spec([
        { layout: 'centered', blocks: [{ type: 'Headline', props: { text: 'Ship it!' } }] },
      ]),
      createDefaultRegistries(),
      { noExclamations: true },
      file,
    );
    expect(violations.some((v) => /noExclamations/.test(v.message))).toBe(true);
    expect(violations[0]?.frameIndex).toBe(0);
  });

  it('walks custom block props for strings, so a PricingCard tier fails too', () => {
    const violations = checkSpec(
      spec([
        {
          layout: 'centered',
          blocks: [
            {
              type: 'PricingCard',
              props: { tier: 'Game-changing!', price: '$1', items: ['a', 'b!'] },
            },
          ],
        },
      ]),
      createDefaultRegistries(),
      { noExclamations: true },
      file,
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('caps Headline and Subhead length but leaves Body alone', () => {
    const longHeadline = 'x'.repeat(81);
    const violations = checkSpec(
      spec([
        {
          layout: 'centered',
          blocks: [
            { type: 'Headline', props: { text: longHeadline } },
            { type: 'Subhead', props: { text: longHeadline } },
            { type: 'Body', props: { text: longHeadline } },
          ],
        },
      ]),
      createDefaultRegistries(),
      { maxHeadline: 80 },
      file,
    );
    expect(violations.filter((v) => /maxHeadline/.test(v.message))).toHaveLength(2);
  });

  it('flags forbidden words case-insensitively across all text', () => {
    const violations = checkSpec(
      spec([
        {
          layout: 'centered',
          blocks: [{ type: 'Body', props: { text: 'This is Revolutionary stuff' } }],
        },
      ]),
      createDefaultRegistries(),
      { forbiddenWords: ['revolutionary', 'game-changing'] },
      file,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('revolutionary');
  });

  it('reports every violation together, not just the first', () => {
    const violations = checkSpec(
      spec([
        {
          layout: 'centered',
          blocks: [
            { type: 'Headline', props: { text: 'Wow!' } },
            { type: 'Body', props: { text: 'game-changing' } },
          ],
        },
      ]),
      createDefaultRegistries(),
      { noExclamations: true, forbiddenWords: ['game-changing'] },
      file,
    );
    expect(violations.length).toBe(2);
  });

  it('passes a clean spec with no violations', () => {
    const violations = checkSpec(
      spec([
        { layout: 'centered', blocks: [{ type: 'Headline', props: { text: 'Ship it' } }] },
      ]),
      createDefaultRegistries(),
      { noExclamations: true, maxHeadline: 80, forbiddenWords: ['revolutionary'] },
      file,
    );
    expect(violations).toEqual([]);
  });
});

describe('checkSpec frame counts', () => {
  it('flags a spec that underflows a Play preset which needs at least 2', () => {
    const s = parseSpec(
      { id: 'store', preset: 'play-phone', frames: [{ layout: 'centered', blocks: [] }] },
      file,
    );
    const violations = checkSpec(s, createDefaultRegistries(), undefined, file);
    expect(violations.some((v) => /frameCount/.test(v.message))).toBe(true);
  });

  it('flags a spec that overflows the Apple 10-frame maximum', () => {
    const frames = Array.from({ length: 11 }, () => ({ layout: 'centered', blocks: [] }));
    const s = parseSpec({ id: 'store', preset: 'ios-6.9', frames }, file);
    const violations = checkSpec(s, createDefaultRegistries(), undefined, file);
    expect(violations.some((v) => /frameCount/.test(v.message))).toBe(true);
  });

  it('reports an unregistered preset rather than skipping it', () => {
    const s = parseSpec(
      { id: 'store', preset: 'ios-6.8', frames: [{ layout: 'centered', blocks: [] }] },
      file,
    );
    const violations = checkSpec(s, createDefaultRegistries(), undefined, file);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('unknown preset');
    expect(violations[0]?.message).toContain('ios-6.9');
  });

  it('accepts a spec within the Apple 1 to 10 range', () => {
    const s = parseSpec(
      { id: 'store', preset: 'ios-6.9', frames: [{ layout: 'centered', blocks: [] }] },
      file,
    );
    expect(checkSpec(s, createDefaultRegistries(), undefined, file)).toEqual([]);
  });
});

describe('parsePng and checkAsset', () => {
  // A committed opaque PNG from the render-still golden suite. The check engine only needs a
  // real PNG; reaching into a neighbouring package's fixture avoids committing a second copy.
  const golden = fileURLToPath(
    new URL('../../render-still/test/golden/ig-portrait.png', import.meta.url),
  );
  const png = readFileSync(golden);

  it('reads the IHDR dimensions of a real PNG', () => {
    expect(parsePng(png, 'ig-portrait.png')).toMatchObject({ width: 1080, height: 1350 });
  });

  it('accepts an opaque PNG at the preset dimensions', () => {
    const entry = createDefaultRegistries().presets.get('ig-portrait');
    const violations = checkAsset(entry, 'ig-portrait', png, 'ig-portrait.png');
    expect(violations).toEqual([]);
  });

  it('flags a wrong size against the preset', () => {
    const entry = createDefaultRegistries().presets.get('ios-6.9');
    const violations = checkAsset(entry, 'ios-6.9', png, 'ig-portrait.png');
    expect(violations.some((v) => /dimensions/.test(v.message))).toBe(true);
  });

  it('flags alpha on an Apple preset', () => {
    const entry = createDefaultRegistries().presets.get('ios-6.9');
    const rgba = fakePng(entry.width, entry.height, 6);
    expect(
      checkAsset(entry, 'ios-6.9', rgba, 'fake.png').some((v) => /noAlpha/.test(v.message)),
    ).toBe(true);
  });

  it('accepts a 24-bit PNG on an Apple preset, which is what noAlpha asks for', () => {
    const entry = createDefaultRegistries().presets.get('ios-6.9');
    expect(
      checkAsset(entry, 'ios-6.9', fakePng(entry.width, entry.height, 2), 'fake.png'),
    ).toEqual([]);
  });

  it('flags a palette PNG carrying a tRNS chunk, where the colour type alone looks opaque', () => {
    const entry = createDefaultRegistries().presets.get('play-feature');
    const header = fakePng(entry.width, entry.height, 3);
    const trns = Buffer.alloc(12);
    trns.writeUInt32BE(0, 0);
    trns.write('tRNS', 4, 'ascii');
    const violations = checkAsset(
      entry,
      'play-feature',
      Buffer.concat([header, trns]),
      'fake.png',
    );
    expect(violations.some((v) => /noAlpha/.test(v.message))).toBe(true);
  });

  it('accepts a Play screenshot at a size the store takes but the preset does not render', () => {
    // Play accepts 320-3840 per side at up to 2:1. 1440x2560 is a real device capture and a
    // valid upload, so rejecting it for not being the preset's 1080x1920 would be a false
    // positive in the exact mode meant for hand-made screenshots.
    const entry = createDefaultRegistries().presets.get('play-phone');
    expect(checkAsset(entry, 'play-phone', fakePng(1440, 2560, 2), 'shot.png')).toEqual([]);
  });

  it('flags a Play screenshot outside the 320 to 3840 per-side range', () => {
    const entry = createDefaultRegistries().presets.get('play-phone');
    const violations = checkAsset(entry, 'play-phone', fakePng(200, 300, 2), 'tiny.png');
    expect(violations.some((v) => /dimensions/.test(v.message))).toBe(true);
  });

  it('accepts the smaller Chrome Web Store screenshot size the docs also allow', () => {
    const entry = createDefaultRegistries().presets.get('cws-screenshot');
    expect(checkAsset(entry, 'cws-screenshot', fakePng(640, 400, 2), 'shot.png')).toEqual([]);
  });

  it('still flags a Chrome Web Store screenshot at neither documented size', () => {
    const entry = createDefaultRegistries().presets.get('cws-screenshot');
    const violations = checkAsset(entry, 'cws-screenshot', fakePng(800, 600, 2), 'shot.png');
    expect(violations.some((v) => /dimensions/.test(v.message))).toBe(true);
    expect(violations[0]?.message).toContain('1280x800, or 640x400');
  });

  it('holds Apple to the exact size, since it declares no size leeway', () => {
    const entry = createDefaultRegistries().presets.get('ios-6.9');
    const violations = checkAsset(entry, 'ios-6.9', fakePng(1290, 2796, 2), 'shot.png');
    expect(violations.some((v) => /dimensions/.test(v.message))).toBe(true);
  });

  it('flags a Play screenshot taller than the 2x aspect ceiling', () => {
    const entry = createDefaultRegistries().presets.get('play-phone');
    // Same 1080 width, but 2400 tall: ratio 2.22, past the ceiling Play enforces.
    const violations = checkAsset(entry, 'play-phone', fakePng(1080, 2400, 2), 'tall.png');
    expect(violations.some((v) => /aspectRatio/.test(v.message))).toBe(true);
  });

  it('accepts the Play preset at its own dimensions, which sit inside the ceiling', () => {
    const entry = createDefaultRegistries().presets.get('play-phone');
    const violations = checkAsset(
      entry,
      'play-phone',
      fakePng(entry.width, entry.height, 2),
      'ok.png',
    );
    expect(violations).toEqual([]);
  });

  it('throws on a non-PNG buffer', () => {
    expect(() => parsePng(Buffer.from('not a png'), 'x.txt')).toThrow(/not a PNG/);
  });
});

describe('checkSpec with a full config', () => {
  it('uses brand rules from defineConfig to validate a spec', () => {
    const config = defineConfig({
      tokens: { color: { accent: '#2563EB' } },
      brandRules: { noExclamations: true, maxHeadline: 20 },
    });
    const registries = createDefaultRegistries();
    const s = spec([
      {
        layout: 'centered',
        blocks: [{ type: 'Headline', props: { text: 'A headline far too long' } }],
      },
    ]);
    const violations = checkSpec(s, registries, config.brandRules, file);
    expect(violations.some((v) => /maxHeadline/.test(v.message))).toBe(true);
  });
});
