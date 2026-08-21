import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkGlyphs, glyphCoverage, parseSpec, type Coverage } from '../src/index.js';

const geist = readFileSync(
  fileURLToPath(new URL('../fonts/Geist-Regular.ttf', import.meta.url)),
);

const at = (char: string): number => char.codePointAt(0) ?? 0;

const spec = (text: string, type = 'Headline'): ReturnType<typeof parseSpec> =>
  parseSpec(
    {
      id: 'glyphs',
      preset: 'ig-portrait',
      frames: [{ layout: 'centered', blocks: [{ type, props: { text } }] }],
    },
    'glyphs.spec.json',
  );

describe('glyphCoverage', () => {
  it('reads the cmap of the bundled font', () => {
    const coverage = glyphCoverage(geist);
    expect(coverage).toBeDefined();
    expect(coverage?.size).toBeGreaterThan(200);
  });

  it('covers Latin, accents, and the typographic punctuation a spec actually uses', () => {
    const coverage = glyphCoverage(geist);
    for (const char of ['A', 'z', '0', ' ', 'é', 'ü', 'ß', 'ñ', '—', '“', '”', '•', '€']) {
      expect(coverage?.has(at(char)), `expected ${char} to be covered`).toBe(true);
    }
  });

  /**
   * The two cases the check exists for. Geist is a Latin face, so a CJK character or an emoji
   * in a spec renders as a tofu box today with nothing reporting it.
   */
  it('does not cover CJK or emoji', () => {
    const coverage = glyphCoverage(geist);
    expect(coverage?.has(at('日'))).toBe(false);
    expect(coverage?.has(at('🎉'))).toBe(false);
  });

  it('returns undefined for a buffer that is not an sfnt font', () => {
    expect(glyphCoverage(Buffer.from('wOFF not really a font'))).toBeUndefined();
    expect(glyphCoverage(Buffer.alloc(0))).toBeUndefined();
    expect(glyphCoverage(Buffer.alloc(64))).toBeUndefined();
  });

  /** A truncated table must not throw: check reports, it does not crash. */
  it('survives a truncated font without throwing', () => {
    expect(() => glyphCoverage(geist.subarray(0, 400))).not.toThrow();
    expect(() => glyphCoverage(geist.subarray(0, 5000))).not.toThrow();
  });
});

describe('checkGlyphs', () => {
  const coverage: Coverage = glyphCoverage(geist);

  it('reports a codepoint the font cannot draw, naming the file, frame, and block', () => {
    const [violation, ...rest] = checkGlyphs(spec('Ship it 🎉'), coverage, 'glyphs.spec.json');
    expect(rest).toHaveLength(0);
    expect(violation?.file).toBe('glyphs.spec.json');
    expect(violation?.frameIndex).toBe(0);
    expect(violation?.message).toContain('Headline');
    expect(violation?.message).toContain('U+1F389');
  });

  it('lists every missing codepoint at once rather than the first', () => {
    const [violation] = checkGlyphs(spec('日本語'), coverage, 'glyphs.spec.json');
    expect(violation?.message).toContain('U+65E5');
    expect(violation?.message).toContain('U+672C');
    expect(violation?.message).toContain('U+8A9E');
  });

  it('passes text the font covers, punctuation and accents included', () => {
    expect(
      checkGlyphs(spec('Café — “quotes” and a bullet •'), coverage, 'glyphs.spec.json'),
    ).toEqual([]);
  });

  /**
   * A newline is a line break rather than a glyph, and fonts do not map it. Flagging it would
   * make the check unusable on any multi-line string.
   */
  it('ignores control characters and zero-width formatting marks', () => {
    expect(checkGlyphs(spec('two\nlines\tand​a join'), coverage, 'g.json')).toEqual([]);
  });

  it('checks a custom block by walking its props, not by knowing its name', () => {
    const custom = parseSpec(
      {
        id: 'glyphs',
        preset: 'ig-portrait',
        frames: [
          {
            layout: 'centered',
            blocks: [{ type: 'PricingCard', props: { tier: 'Pro 🎉', price: '$12' } }],
          },
        ],
      },
      'glyphs.spec.json',
    );
    const [violation] = checkGlyphs(custom, coverage, 'glyphs.spec.json');
    expect(violation?.message).toContain('PricingCard');
    expect(violation?.message).toContain('U+1F389');
  });

  /**
   * A font this parser cannot read must never produce a violation against text it draws
   * perfectly well. Silence is the only safe response to a parser limitation.
   */
  it('reports nothing when coverage is unknown', () => {
    expect(checkGlyphs(spec('日本語 🎉'), undefined, 'glyphs.spec.json')).toEqual([]);
  });
});
