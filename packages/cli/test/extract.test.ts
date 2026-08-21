import { describe, expect, it } from 'vitest';
import {
  flattenModuleTokens,
  groupFontFiles,
  mapToContract,
  parseCssTokens,
} from '../src/init/extract.js';

/** Invented palettes. Shapes mirror real projects; the values are not anyone's brand. */
const TAILWIND_V4 = `@import "tailwindcss";
/* a comment with --color-decoy: #ff0000; inside it */
@theme {
  --color-obsidian: #0a0a0b; /* page background */
  --color-carbon: #121214;
  --color-steel: #62626b;
  --color-gilt: #e8c889;
  --color-bone: #f4f1ea;
  --color-muted: #8a8a92;
  --font-display: var(--font-serif), Georgia, serif;
  --radius-card: 12px;
}`;

const ROOT_VARS = `:root {
  --bg-base: #FBFAF7;
  --bg-surface: #FFFFFF;
  --accent: #2563A8;
  --text-primary: #1A1A17;
  --text-secondary: #55534C;
  --success: #1F5E2E;
  --destructive: #8F2A1E;
  --spacing-md: 12px;
}`;

describe('parseCssTokens', () => {
  it('reads Tailwind v4 @theme and strips the --color- namespace', () => {
    const names = parseCssTokens(TAILWIND_V4).map((t) => t.name);
    expect(names).toContain('obsidian');
    expect(names).toContain('gilt');
    expect(names).not.toContain('color-obsidian');
  });

  it('keeps only colour-valued properties', () => {
    const names = parseCssTokens(TAILWIND_V4).map((t) => t.name);
    expect(names).not.toContain('display');
    expect(names).not.toContain('card');
  });

  it('ignores declarations inside comments', () => {
    expect(parseCssTokens(TAILWIND_V4).map((t) => t.name)).not.toContain('decoy');
  });

  it('reads :root custom properties too', () => {
    expect(parseCssTokens(ROOT_VARS)).toContainEqual({ name: 'accent', value: '#2563A8' });
  });
});

describe('flattenModuleTokens', () => {
  it('flattens nested exports to dotted names, keeping only colours', () => {
    const tokens = flattenModuleTokens({
      semantic: { text: { primary: '#111111' }, bg: { ground: '#ffffff' } },
      space: { md: 12 },
      label: 'not a colour',
    });
    expect(tokens).toContainEqual({ name: 'semantic.text.primary', value: '#111111' });
    expect(tokens).toContainEqual({ name: 'semantic.bg.ground', value: '#ffffff' });
    expect(tokens.map((t) => t.name)).not.toContain('label');
  });
});

describe('mapToContract', () => {
  it('matches conventional names and reports them as inferred', () => {
    const { assignments } = mapToContract(parseCssTokens(ROOT_VARS));
    const byKey = Object.fromEntries(assignments.map((a) => [a.key, a]));
    expect(byKey['accent']).toMatchObject({
      value: '#2563A8',
      source: 'accent',
      inferred: true,
    });
    expect(byKey['canvas']).toMatchObject({ value: '#FBFAF7', inferred: true });
    expect(byKey['ink']).toMatchObject({ value: '#1A1A17', inferred: true });
    expect(byKey['negative']).toMatchObject({ value: '#8F2A1E', inferred: true });
  });

  /**
   * A dark palette still carries a near-white text colour, so "is the lightest colour light"
   * answers yes for both themes. The median is where the two actually differ.
   */
  it('detects a dark palette and grounds it on the darkest colour', () => {
    const { assignments } = mapToContract(parseCssTokens(TAILWIND_V4));
    const byKey = Object.fromEntries(assignments.map((a) => [a.key, a]));
    expect(byKey['canvas']?.value).toBe('#0a0a0b');
    expect(byKey['ink']?.value).toBe('#f4f1ea');
    expect(byKey['surface']?.value).toBe('#121214');
  });

  /** An accent the colour of the background is invisible, and a name cannot be relied on. */
  it('picks a chromatic accent rather than the background', () => {
    const { assignments } = mapToContract(parseCssTokens(TAILWIND_V4));
    const byKey = Object.fromEntries(assignments.map((a) => [a.key, a]));
    expect(byKey['accent']?.value).toBe('#e8c889');
    expect(byKey['accent']?.value).not.toBe(byKey['canvas']?.value);
    expect(byKey['accent']?.inferred).toBe(false);
  });

  /**
   * A bezel equal to the canvas renders a device as a phone-shaped hole with only its shadow
   * to separate it, which CLAUDE.md records as the trap in the default token set.
   */
  it('never gives bezel the canvas colour', () => {
    for (const source of [TAILWIND_V4, ROOT_VARS]) {
      const byKey = Object.fromEntries(
        mapToContract(parseCssTokens(source)).assignments.map((a) => [a.key, a]),
      );
      expect(byKey['bezel']?.value).not.toBe(byKey['canvas']?.value);
    }
  });

  it('reports every colour no contract key claimed', () => {
    const { unused } = mapToContract(parseCssTokens(TAILWIND_V4));
    expect(unused.map((t) => t.name)).toContain('steel');
  });

  it('labels a name match as inferred and a fallback as a guess', () => {
    const { assignments } = mapToContract(parseCssTokens(TAILWIND_V4));
    const muted = assignments.find((a) => a.key === 'inkMuted');
    expect(muted?.inferred).toBe(true);
    expect(assignments.filter((a) => !a.inferred).length).toBeGreaterThan(0);
  });
});

describe('groupFontFiles', () => {
  it('reads weights from filenames and groups by family', () => {
    const [family] = groupFontFiles([
      '/f/Geist-Regular.ttf',
      '/f/Geist-Bold.ttf',
      '/f/Geist-Medium.ttf',
    ]);
    expect(family?.family).toBe('Geist');
    expect(family?.files.map((f) => f.weight)).toEqual([400, 500, 700]);
  });

  /** A wrong style is the same class of silent error as a wrong weight, so italics are skipped. */
  it('skips italics and files with no recognisable weight', () => {
    const families = groupFontFiles([
      '/f/Geist-Italic.ttf',
      '/f/Geist-BoldItalic.ttf',
      '/f/Mystery.ttf',
    ]);
    expect(families).toEqual([]);
  });

  it('distinguishes SemiBold from Bold', () => {
    const [family] = groupFontFiles(['/f/Inter-SemiBold.otf', '/f/Inter-Bold.otf']);
    expect(family?.files.map((f) => f.weight)).toEqual([600, 700]);
  });
});
