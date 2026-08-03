import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT,
  DEFAULT_TYPE,
  parseSpec,
  resolveTokens,
  type FontSource,
  type TokensInput,
} from '../src/index.js';

const font: FontSource = {
  family: 'Geist',
  files: [{ path: './fonts/Geist-Regular.ttf', weight: 400 }],
};

const minimal: TokensInput = { color: { accent: '#2563EB' }, font: { body: font } };

describe('token scale', () => {
  it('scales spacing and font size, and leaves colour, radius, and line height alone', () => {
    const one = resolveTokens(minimal, 1);
    const scaled = resolveTokens(minimal, 2.5);

    expect(scaled.space.lg).toBe((one.space.lg ?? 0) * 2.5);
    expect(scaled.type.body?.fontSize).toBe((one.type.body?.fontSize ?? 0) * 2.5);

    expect(scaled.color.accent).toBe('#2563EB');
    expect(scaled.radius.lg).toBe(one.radius.lg);
    expect(scaled.type.body?.lineHeight).toBe(one.type.body?.lineHeight);
    expect(scaled.type.display?.letterSpacing).toBe(one.type.display?.letterSpacing);
  });

  it('lets the config override the preset default rather than the reverse', () => {
    const resolved = resolveTokens({ ...minimal, scale: 4 }, 2.5);
    const baseline = resolveTokens(minimal, 1);

    expect(resolved.space.lg).toBe((baseline.space.lg ?? 0) * 4);
  });

  it('rejects a scale that would silently collapse the layout', () => {
    expect(() => resolveTokens(minimal, 0)).toThrow(/greater than zero/);
    expect(() => resolveTokens(minimal, Number.NaN)).toThrow(/greater than zero/);
  });
});

describe('token defaults', () => {
  it('requires only color.accent', () => {
    const resolved = resolveTokens(minimal, 1);

    expect(resolved.color.accent).toBe('#2563EB');
    expect(resolved.color.canvas).toBeDefined();
    expect(resolved.space['3xl']).toBeDefined();
    expect(resolved.type.display).toBeDefined();
  });

  it('merges consumer colours over the defaults without dropping the rest', () => {
    const resolved = resolveTokens(
      { color: { accent: '#FF0000', canvas: '#FFFFFF' }, font: { body: font } },
      1,
    );

    expect(resolved.color.canvas).toBe('#FFFFFF');
    expect(resolved.color.ink).toBeDefined();
  });

  it('falls back to the single supplied family for both display and body', () => {
    const resolved = resolveTokens(minimal, 1);

    expect(resolved.font.display).toEqual(font);
    expect(resolved.font.body).toEqual(font);
  });

  it('falls back to the bundled font, so color.accent really is the only requirement', () => {
    const resolved = resolveTokens({ color: { accent: '#2563EB' } }, 1);

    expect(resolved.font.body).toEqual(DEFAULT_FONT);
    expect(resolved.font.display).toEqual(DEFAULT_FONT);
  });
});

describe('the bundled font', () => {
  it('ships every weight the default type scale references', () => {
    const available = new Set(DEFAULT_FONT.files.map((file) => file.weight));
    const referenced = Object.entries(DEFAULT_TYPE).map(
      ([name, style]) => [name, style.fontWeight] as const,
    );

    // satori substitutes a missing weight silently rather than failing, so a default type
    // scale naming a weight that is not bundled would render a wrong-weight asset with
    // nothing to point at. This is the cheapest possible guard against the two drifting.
    const missing = referenced.filter(([, weight]) => !available.has(weight));
    expect(missing).toEqual([]);
  });

  it('resolves to files that exist on disk', () => {
    for (const file of DEFAULT_FONT.files) {
      expect(existsSync(file.path), `${file.path} is missing`).toBe(true);
    }
  });

  it('redistributes its licence alongside the binaries', () => {
    const licence = join(dirname(DEFAULT_FONT.files[0]?.path ?? ''), 'OFL.txt');

    expect(existsSync(licence)).toBe(true);
    expect(readFileSync(licence, 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});

describe('the spec schema closes nothing', () => {
  it('accepts preset, layout, block type, background, and slot names core has never seen', () => {
    const spec = parseSpec(
      {
        id: 'quarterly-recap',
        preset: 'billboard-48-sheet',
        frames: [
          {
            layout: 'feature-grid',
            background: 'brandWash',
            blocks: [{ type: 'PricingCard', props: { tier: 'pro' }, slot: 'col2' }],
          },
        ],
      },
      'recap.spec.json',
    );

    expect(spec.frames[0]?.layout).toBe('feature-grid');
    expect(spec.frames[0]?.blocks[0]?.type).toBe('PricingCard');
  });

  it('accepts a preset array so fan-out is committed in the spec', () => {
    const spec = parseSpec(
      {
        id: 'app-store',
        preset: ['ios-6.9', 'ipad-13'],
        frames: [{ layout: 'centered', blocks: [] }],
      },
      'store.spec.json',
    );

    expect(spec.preset).toEqual(['ios-6.9', 'ipad-13']);
  });
});
