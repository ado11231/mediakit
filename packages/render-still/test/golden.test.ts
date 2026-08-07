import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import { applyConfig, createDefaultRegistries, parseSpec, presetNames } from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../src/index.js';

/**
 * Every preset gets a golden-file test. This is the determinism guarantee the roadmap sells,
 * enforced mechanically rather than asserted in a README: a change in satori, resvg, the token
 * contract, or a built-in block that alters output is caught here as a byte diff, not
 * discovered when a regenerated App Store screenshot silently shifts.
 *
 * The committed goldens were rendered on macOS arm64. resvg ships per-platform native
 * binaries, so byte agreement with Linux CI is the pre-publish task in roadmap.md, not a
 * premise this test can lean on. The byte comparison is therefore gated to darwin/arm64;
 * every other platform still runs the render (a throw is a regression anywhere) but skips the
 * compare with a pointer at the task that would close it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, 'golden');
const isGoldenHost = process.platform === 'darwin' && process.arch === 'arm64';

const tokens = { color: { accent: '#2563EB' } };

const spec = parseSpec(
  {
    id: 'golden',
    preset: [
      'ig-portrait',
      'ig-square',
      'story',
      'li-portrait',
      'ios-6.9',
      'ios-6.5',
      'ipad-13',
      'play-phone',
      'play-feature',
      'github-social',
      'producthunt-gallery',
      'cws-screenshot',
      'cws-marquee',
    ],
    frames: [
      {
        layout: 'centered',
        blocks: [
          { type: 'Eyebrow', props: { text: 'Golden', align: 'center' } },
          { type: 'Headline', props: { text: 'Determinism', align: 'center' } },
          {
            type: 'Body',
            props: { text: 'Same spec, same bytes, every run.', align: 'center' },
          },
        ],
      },
    ],
  },
  'golden.spec.json',
);

const registries = applyConfig(createDefaultRegistries(), {
  tokens,
  blocks: BUILTIN_BLOCKS,
  layouts: BUILTIN_LAYOUTS,
  frames: BUILTIN_FRAMES,
});

const sha = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

describe.skipIf(!isGoldenHost)('golden files (darwin/arm64)', () => {
  for (const preset of presetNames(spec)) {
    it(`reproduces the committed golden for ${preset}`, async () => {
      const golden = join(goldenDir, `${preset}.png`);
      expect(existsSync(golden), `missing golden: ${golden}`).toBe(true);

      const [frame] = await renderSpec({
        spec,
        registries,
        tokens,
        preset,
        file: 'golden.spec.json',
      });
      const expected = await readFile(golden);

      expect(frame).toBeDefined();
      expect(sha(frame?.png ?? Buffer.alloc(0))).toBe(sha(expected));
    }, 30_000);
  }
});

describe.skipIf(isGoldenHost)('golden files (non-darwin/arm64)', () => {
  /**
   * resvg's native binaries disagree across platforms at the byte level, so a golden committed
   * from macOS arm64 would fail the compare here without indicating a real regression. The
   * render still runs, so a satori throw or a preset that no longer exists is caught on every
   * platform. Closing the cross-platform byte gap is the pre-publish Linux task in roadmap.md.
   */
  it('renders every preset without a throw, even where the byte compare is skipped', async () => {
    for (const preset of presetNames(spec)) {
      const [frame] = await renderSpec({
        spec,
        registries,
        tokens,
        preset,
        file: 'golden.spec.json',
      });
      expect(frame?.png.length ?? 0).toBeGreaterThan(0);
    }
  }, 60_000);
});
