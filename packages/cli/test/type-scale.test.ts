import { DEFAULT_SPACE, MIN_TEXT_FRACTION } from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import {
  mapTypeScale,
  parseCssSpacing,
  parseCssTypeSteps,
  parseModuleTypeSteps,
  proposeScale,
  toPx,
} from '../src/init/type-scale.js';

/** Invented, but shaped exactly like a Tailwind v4 project's theme block. */
const THEME = `@theme {
  --color-brand: #f97316;
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-base--line-height: 1.5rem;
  --text-xl: 1.25rem;
  --text-3xl: 1.875rem;
  --text-3xl--letter-spacing: -0.025em;
  --text-3xl--font-weight: 600;
  --text-4xl: 2.25rem;
  --spacing: 0.25rem;
}`;

describe('toPx', () => {
  it('reads rem against a 16px root, and px verbatim', () => {
    expect(toPx('1.5rem')).toBe(24);
    expect(toPx('18px')).toBe(18);
    expect(toPx('20')).toBe(20);
  });

  it('returns nothing for a value it cannot state as a length', () => {
    expect(toPx('clamp(1rem, 2vw, 3rem)')).toBeUndefined();
    expect(toPx('var(--text-lg)')).toBeUndefined();
  });
});

describe('parseCssTypeSteps', () => {
  it('reads the ladder with the modifiers hung off each rung', () => {
    const steps = parseCssTypeSteps(THEME);
    const base = steps.find((s) => s.name === 'text-base');
    const large = steps.find((s) => s.name === 'text-3xl');

    expect(base).toEqual({ name: 'text-base', fontSize: 16, lineHeight: 24 });
    expect(large?.letterSpacing).toBe('-0.025em');
    expect(large?.fontWeight).toBe(600);
  });

  it('does not mistake a modifier for a rung of its own', () => {
    expect(parseCssTypeSteps(THEME).map((s) => s.name)).not.toContain('text-base--line-height');
  });
});

describe('mapTypeScale', () => {
  /**
   * A ladder is named by size and the contract is named by role, so there is no name to match
   * on. `body` anchors, and every other role takes the rung nearest the ratio mediakit's own
   * scale uses: your rungs, mediakit's shape.
   */
  it('anchors body and takes each role from the nearest rung', () => {
    const assigned = mapTypeScale(parseCssTypeSteps(THEME), [400, 700]);
    const at = (key: string) => assigned.find((a) => a.key === key);

    expect(at('body')?.style.fontSize).toBe(16);
    expect(at('body')?.source).toBe('text-base');
    expect(at('display')?.style.fontSize).toBe(36);
    expect(at('caption')?.style.fontSize).toBe(12);
  });

  it('converts a paired line height to the unitless multiple the contract stores', () => {
    const assigned = mapTypeScale(parseCssTypeSteps(THEME), [400, 700]);
    expect(assigned.find((a) => a.key === 'body')?.style.lineHeight).toBe(1.5);
  });

  /**
   * The failure this exists to prevent: satori substitutes a missing weight silently, so a
   * scale naming a weight the loaded font does not ship renders wrong with no error at all.
   */
  it('snaps every weight to one the loaded font actually ships', () => {
    const assigned = mapTypeScale(parseCssTypeSteps(THEME), [400, 700]);
    for (const a of assigned) expect([400, 700]).toContain(a.style.fontWeight);
  });

  it('keeps a weight the font does ship', () => {
    const assigned = mapTypeScale(parseCssTypeSteps(THEME), [400, 600, 700]);
    expect(assigned.find((a) => a.key === 'title')?.style.fontWeight).toBe(600);
  });

  it('marks a role as a guess when the ladder has no rung near it', () => {
    const sparse = mapTypeScale([{ name: 'only', fontSize: 16 }], [400, 700]);
    const display = sparse.find((a) => a.key === 'display');
    expect(display?.inferred).toBe(false);
    expect(display?.source).toContain('no rung near');
  });

  it('says nothing about a source with no ladder at all', () => {
    expect(mapTypeScale([], [400, 700])).toEqual([]);
  });
});

describe('parseModuleTypeSteps', () => {
  it('reads a nested style object and its unitless line height', () => {
    const steps = parseModuleTypeSteps({
      typography: { body: { fontSize: 16, lineHeight: 1.5, fontWeight: 400 } },
    });
    expect(steps).toEqual([
      { name: 'typography.body', fontSize: 16, lineHeight: 24, fontWeight: 400 },
    ]);
  });

  it('reads a flat ladder under a type-ish key', () => {
    const steps = parseModuleTypeSteps({ fontSize: { sm: 14, lg: 20 } });
    expect(steps.map((s) => s.fontSize)).toEqual([14, 20]);
  });
});

describe('parseCssSpacing', () => {
  /**
   * mediakit's own ladder is a 4px grid at 1/2/3/4/6/8/10, which is exactly what Tailwind's
   * default 0.25rem base produces. Writing a block that changes nothing is noise in a file
   * whose whole justification is that a human reads it.
   */
  it('says nothing when the base reproduces the default ladder', () => {
    expect(parseCssSpacing(THEME)).toBeUndefined();
  });

  it('builds the ladder from a base that differs, in whole pixels', () => {
    const space = parseCssSpacing('@theme { --spacing: 0.5rem; }');
    expect(space?.base).toBe(8);
    expect(space?.values).toEqual({
      xs: 8,
      sm: 16,
      md: 24,
      lg: 32,
      xl: 48,
      '2xl': 64,
      '3xl': 80,
    });
  });

  it('prefers an explicit ladder over a base', () => {
    const declared = Object.entries(DEFAULT_SPACE)
      .map(([key, value]) => `--spacing-${key}: ${value * 2}px;`)
      .join('\n');
    const space = parseCssSpacing(`:root { ${declared} }`);
    expect(space?.values['lg']).toBe(32);
  });
});

describe('proposeScale', () => {
  const type = { caption: { fontSize: 13, fontWeight: 400, lineHeight: 1.35 } };

  it('proposes the multiplier that clears the legibility floor', () => {
    const proposal = proposeScale(
      type,
      { name: 'ios-6.9', width: 1320, constrained: true },
      MIN_TEXT_FRACTION,
    );
    // 1320 * 0.035 / 13 = 3.55, rounded up to a tenth.
    expect(proposal?.scale).toBe(3.6);
    expect(proposal?.reason).toContain('ios-6.9');
  });

  /**
   * Scoped to one canvas on purpose. The floor is a fraction of a canvas's own width, so
   * taking the widest registered preset would hand every project a scale that renders display
   * type at a quarter of the canvas.
   */
  it('says nothing for a canvas with no store constraints', () => {
    expect(
      proposeScale(
        type,
        { name: 'ig-portrait', width: 1080, constrained: false },
        MIN_TEXT_FRACTION,
      ),
    ).toBeUndefined();
  });
});
