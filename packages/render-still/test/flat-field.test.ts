import { inflateSync } from 'node:zlib';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import { applyConfig, createDefaultRegistries, parseSpec } from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../src/index.js';

/**
 * Invariant 12, enforced rather than claimed: nothing is composited into an output that the
 * spec did not name. A single `Background` block at a known colour is rendered at every
 * registered preset and every pixel is asserted to equal that colour, so a watermark, badge,
 * or attribution mark anywhere on any canvas fails here.
 *
 * A golden-file test cannot catch this. A mark introduced before the goldens were written
 * would be baked into them and would compare equal forever. A flat field has no such blind
 * spot: the expected value comes from the spec, not from a previous render.
 *
 * Enumerated from the preset registry rather than a literal list, so registering a preset
 * without extending this test is not possible.
 */

const FLAT = '#7C3AED';
// `accent` is required by the token contract; only `flatField` is used by this spec.
const tokens = { color: { accent: '#2563EB', flatField: FLAT } };

const registries = applyConfig(createDefaultRegistries(), {
  tokens,
  blocks: BUILTIN_BLOCKS,
  layouts: BUILTIN_LAYOUTS,
  frames: BUILTIN_FRAMES,
});

const PRESETS = registries.presets.names();

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Decoded {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/**
 * Minimal PNG reader for the two shapes this pipeline emits: resvg's colour type 6, and
 * colour type 2 from `encodeRgbPng` on the `noAlpha` presets. Both are 8-bit and
 * non-interlaced. Written here rather than taken as a dependency because the whole point is
 * to inspect our own bytes with something that shares no code with the encoder that wrote
 * them.
 */
const decodePng = (png: Buffer): Decoded => {
  if (!png.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colourType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8) throw new Error(`unexpected bit depth ${bitDepth}`);
      if (interlace !== 0) throw new Error('interlaced PNG');
      if (colourType !== 2 && colourType !== 6) {
        throw new Error(`unexpected colour type ${colourType}`);
      }
      channels = colourType === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      // IDAT is legally split across any number of chunks; the zlib stream spans all of them.
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const out = y * stride;
    const prev = out - stride;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[line + x] ?? 0;
      const a = x >= channels ? (pixels[out + x - channels] ?? 0) : 0;
      const b = y > 0 ? (pixels[prev + x] ?? 0) : 0;
      const c = y > 0 && x >= channels ? (pixels[prev + x - channels] ?? 0) : 0;

      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + ((a + b) >> 1);
          break;
        case 4:
          recon = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown filter type ${String(filter)} on row ${y}`);
      }
      pixels[out + x] = recon & 0xff;
    }
  }

  return { width, height, channels, pixels };
};

const spec = parseSpec(
  {
    id: 'flat-field',
    preset: PRESETS,
    frames: [
      {
        layout: 'centered',
        // The frame background matches the block so the assertion is exactly "every pixel is
        // the colour the spec named", with no edge tolerance to hide a mark in.
        background: 'flatField',
        blocks: [{ type: 'Background', props: { color: 'flatField' } }],
      },
    ],
  },
  'flat-field.spec.json',
);

const expected = {
  r: Number.parseInt(FLAT.slice(1, 3), 16),
  g: Number.parseInt(FLAT.slice(3, 5), 16),
  b: Number.parseInt(FLAT.slice(5, 7), 16),
};

describe('no watermark (invariant 12)', () => {
  it('covers every registered preset', () => {
    expect(PRESETS.length).toBeGreaterThan(0);
  });

  for (const preset of PRESETS) {
    it(`renders a flat field with no extra pixels at ${preset}`, async () => {
      const [frame] = await renderSpec({
        spec,
        registries,
        tokens,
        preset,
        file: 'flat-field.spec.json',
      });
      expect(frame).toBeDefined();

      const { width, height, channels, pixels } = decodePng(frame!.png);
      const { width: pw, height: ph } = registries.presets.get(preset);
      expect({ width, height }).toEqual({ width: pw, height: ph });

      // Scanned rather than asserted per pixel: a multi-megapixel canvas cannot afford an
      // expect() call each, and the first mismatch is the only useful one to report.
      let bad: string | undefined;
      for (let i = 0; i < width * height && bad === undefined; i += 1) {
        const p = i * channels;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        const a = channels === 4 ? pixels[p + 3] : 255;
        if (r !== expected.r || g !== expected.g || b !== expected.b || a !== 255) {
          bad =
            `pixel (${i % width}, ${Math.floor(i / width)}) is ` +
            `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a)}), expected ` +
            `rgba(${String(expected.r)}, ${String(expected.g)}, ${String(expected.b)}, 255)`;
        }
      }

      expect(bad, `${preset}: ${bad ?? ''}`).toBeUndefined();
    });
  }
});
