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
 * Cross-platform byte identity was verified in August 2026 by rendering all 13 presets on
 * macOS arm64 and Linux x64 (via Docker, node:22) and confirming every SHA-256 matches. The
 * committed goldens therefore compare on every platform, not just the one they were rendered
 * on. See `cross-platform-hashes.mjs` for the script that reproduces the verification.
 */
const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, 'golden');

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

describe('golden files', () => {
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

  /**
   * resvg always encodes colour type 6, so the render path re-encodes without the channel for
   * presets whose channel rejects one. Asserted against real output rather than a synthetic
   * header, because the synthetic fixtures in core's check suite passed the whole time the
   * renderer was producing PNGs Apple would have refused.
   */
  it('emits colour type 2 for exactly the presets declaring noAlpha', async () => {
    for (const preset of presetNames(spec)) {
      const entry = registries.presets.get(preset);
      const wantsOpaque = entry.constraints?.some((c) => c.kind === 'noAlpha') ?? false;
      const golden = await readFile(join(goldenDir, `${preset}.png`));
      expect(golden.readUInt8(25), preset).toBe(wantsOpaque ? 2 : 6);
    }
  });
});
