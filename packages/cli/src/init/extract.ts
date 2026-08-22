import { DEFAULT_COLOR } from '@mediakit/core';

/**
 * Token extraction for `init`, and only for `init`.
 *
 * Invariant 11 puts every piece of inference here rather than in `render`: this runs once, a
 * human watches it, and it writes a file that gets committed and reviewed. The corollary is
 * that it has to be reviewable, which is why every value it produces carries where it came
 * from, and why a value it could not derive from the source is labelled a guess in both the
 * terminal output and the generated file rather than quietly filled in.
 */

export interface ColorToken {
  name: string;
  value: string;
}

export interface Assignment {
  /** The mediakit contract key: accent, canvas, surface, ink, inkMuted, positive, negative. */
  key: string;
  value: string;
  /** Human-readable provenance, written into the config as a comment. */
  source: string;
  /** False when a name match failed and a stated fallback rule picked the value. */
  inferred: boolean;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla|oklch|color)\(/i;

export const isColor = (value: string): boolean =>
  HEX.test(value.trim()) || FUNCTIONAL.test(value.trim());

/**
 * Reads custom properties out of `:root` and Tailwind v4's `@theme`, which is where a v4
 * project keeps its palette now that `tailwind.config.ts` is optional.
 *
 * A regex rather than a CSS parser: the target is `--name: value;` declarations, a full
 * parser is a dependency, and anything this misses shows up as a token the report lists as
 * unused rather than as a wrong value.
 */
export const parseCssTokens = (source: string): ColorToken[] => {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: ColorToken[] = [];
  const seen = new Set<string>();

  for (const match of withoutComments.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const rawName = match[1];
    const rawValue = match[2];
    if (rawName === undefined || rawValue === undefined) continue;

    const value = rawValue.trim();
    if (!isColor(value)) continue;

    // Tailwind v4 namespaces every palette entry as --color-*; the prefix is machinery, not
    // part of the designer's name for the colour.
    const name = rawName.replace(/^color-/, '');
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, value });
  }

  return out;
};

/**
 * Flattens a token module's default or named exports into dotted names, so Jrnyman's
 * `semantic.text.primary` and a flat `{ accent: '#fff' }` reach the matcher the same way.
 */
export const flattenModuleTokens = (value: unknown, prefix = ''): ColorToken[] => {
  if (typeof value === 'string') {
    return isColor(value) ? [{ name: prefix, value }] : [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, child]) =>
    flattenModuleTokens(child, prefix === '' ? key : `${prefix}.${key}`),
  );
};

/**
 * Name patterns per contract key, most specific first. Matched against the last dotted
 * segment and against the whole name, so both `--text-primary` and `semantic.text.primary`
 * land on `ink`.
 */
const PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  accent: [/^accent$/, /^primary$/, /^brand$/, /accent$/, /brand/, /primary$/],
  canvas: [/^bg-base$/, /^background$/, /^canvas$/, /bg\.ground$/, /^bg$/, /ground$/, /base$/],
  surface: [/^bg-surface$/, /^surface$/, /^card$/, /bg\.raised$/, /raised$/, /elevated$/],
  ink: [/^text-primary$/, /^foreground$/, /^ink$/, /text\.primary$/, /^fg$/],
  inkMuted: [/^text-secondary$/, /^muted$/, /text\.secondary$/, /muted$/, /secondary$/],
  positive: [/^success$/, /^positive$/, /success/, /positive/],
  negative: [/^destructive$/, /^danger$/, /^error$/, /^negative$/, /destructive/, /danger/],
  bezel: [/^bezel$/],
};

/**
 * Where a role borrows from when the source has no distinct colour left for it. `accent` is
 * absent on purpose: no other role can stand in for a brand colour.
 */
const BORROW: Readonly<Record<string, string>> = {
  surface: 'canvas',
  inkMuted: 'ink',
  bezel: 'ink',
};

/** Contract keys in the order a reader wants to check them. */
export const CONTRACT_KEYS = Object.keys(PATTERNS);

const luminance = (hex: string): number => {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  const channel = (at: number): number => {
    const raw = Number.parseInt(full.slice(at, at + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  if (full.length < 6 || /[^0-9a-f]/i.test(full)) return 0.5;
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

/**
 * HSV saturation. An accent is the chromatic colour in a palette that is otherwise neutral,
 * which is a property a name cannot be relied on to carry: this palette calls its gold
 * `champagne` and its background `obsidian`.
 */
const saturation = (hex: string): number => {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  if (full.length < 6 || /[^0-9a-f]/i.test(full)) return 0;
  const parts = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  const max = Math.max(...parts);
  const min = Math.min(...parts);
  return max === 0 ? 0 : (max - min) / max;
};

const match = (tokens: readonly ColorToken[], key: string): ColorToken | undefined => {
  for (const pattern of PATTERNS[key] ?? []) {
    const hit = tokens.find(
      (token) => pattern.test(token.name) || pattern.test(token.name.split('.').at(-1) ?? ''),
    );
    if (hit !== undefined) return hit;
  }
  return undefined;
};

export interface Mapping {
  assignments: readonly Assignment[];
  /** Every colour the source declared that no contract key claimed. */
  unused: readonly ColorToken[];
}

/**
 * Maps a source palette onto the token contract.
 *
 * A name match is reported as inferred. Where no name matches, a stated fallback picks by
 * luminance and is reported as a guess, because a design system whose colours are named
 * `obsidian` and `champagne` carries no clue that either is a background. The fallback rule
 * is named in the output rather than applied silently: a reviewer who disagrees needs to see
 * what the choice was, not just the result.
 */
export const mapToContract = (tokens: readonly ColorToken[]): Mapping => {
  const hexish = tokens.filter((t) => HEX.test(t.value));
  const byLuminance = [...hexish].sort((a, b) => luminance(a.value) - luminance(b.value));
  const darkest = byLuminance.at(0);
  const lightest = byLuminance.at(-1);

  // Median rather than either extreme. A dark palette still carries a near-white text colour,
  // so "is the lightest colour light" answers yes for both themes; the middle of the ramp is
  // where a dark and a light system actually differ.
  const median = byLuminance.at(Math.floor(byLuminance.length / 2));
  const dark = median !== undefined && luminance(median.value) < 0.5;

  const assignments: Assignment[] = [];
  const claimed = new Set<string>();

  // Two roles must never share a value. A surface the colour of the ink is a card you cannot
  // read, and an inkMuted the colour of the canvas is invisible; both happen when a source
  // carries fewer distinct colours than the contract has roles, and both rendered before this
  // was enforced. canvas resolves first so the rest can refuse to equal it.
  const taken = new Set<string>();
  const free = (token: ColorToken): boolean => !taken.has(token.value);
  const valueOf = (key: string): string | undefined =>
    assignments.find((a) => a.key === key)?.value;
  const notCanvas = (token: ColorToken): boolean => token.value !== valueOf('canvas');

  const fallbacks: Readonly<Record<string, () => ColorToken | undefined>> = {
    // A theme's ground is its extreme: the darkest colour in a dark palette, the lightest in
    // a light one. Its ink is the opposite extreme, which is also what makes them legible
    // together.
    canvas: () => (dark ? darkest : lightest),
    ink: () => (dark ? lightest : darkest),
    surface: () => (dark ? byLuminance.find(free) : [...byLuminance].reverse().find(free)),
    inkMuted: () =>
      byLuminance.filter(free).at(Math.floor(byLuminance.filter(free).length / 2)),
    accent: () =>
      [...hexish]
        .filter((t) => !claimed.has(t.name) && notCanvas(t) && free(t))
        .sort((a, b) => saturation(b.value) - saturation(a.value))
        .at(0),
    // A device bezel is near-black whatever the theme. Left equal to canvas it renders as a
    // phone-shaped hole with only its shadow to separate it, which is the trap CLAUDE.md
    // records against the default.
    // Neutral, not merely dark. "Darkest available" picks a saturated magenta out of a
    // palette whose spare colours are chart accents, and a magenta bezel is worse than a
    // borrowed one.
    bezel: () => byLuminance.find((t) => notCanvas(t) && free(t) && saturation(t.value) < 0.25),
  };

  const rules: Readonly<Record<string, string>> = {
    canvas: `${dark ? 'darkest' : 'lightest'} colour found`,
    ink: `${dark ? 'lightest' : 'darkest'} colour found`,
    surface: 'second-most-extreme colour found',
    inkMuted: 'mid-luminance colour found',
    accent: 'most saturated colour found',
    bezel: 'darkest neutral that is not the canvas; a bezel must contrast it',
  };

  const RESOLUTION_ORDER = [
    'canvas',
    'ink',
    'surface',
    'inkMuted',
    'accent',
    'positive',
    'negative',
    'bezel',
  ];

  for (const key of RESOLUTION_ORDER) {
    const named = match(tokens, key);
    if (named !== undefined) {
      assignments.push({ key, value: named.value, source: named.name, inferred: true });
      claimed.add(named.name);
      taken.add(named.value);
      continue;
    }

    const guess = fallbacks[key]?.();
    if (guess !== undefined) {
      assignments.push({
        key,
        value: guess.value,
        source: `${rules[key] ?? 'fallback'} (${guess.name})`,
        inferred: false,
      });
      claimed.add(guess.name);
      taken.add(guess.value);
      continue;
    }

    // The source carries fewer distinct colours than the contract has roles. Borrowing from a
    // role already filled keeps the result in-theme and legible, where leaving the key out
    // would hand it to mediakit's own defaults, which are dark and would clash on a light
    // palette. `accent` has no stand-in: it is the one value a neutral default cannot fake,
    // and omitting it would also break the token contract's required field.
    const borrowed = BORROW[key];
    const value = borrowed === undefined ? undefined : valueOf(borrowed);
    assignments.push(
      value === undefined
        ? {
            key,
            value: DEFAULT_COLOR[key] ?? '#000000',
            source: `no colour in the source could fill this; mediakit's default`,
            inferred: false,
          }
        : {
            key,
            value,
            source: `the source has no distinct colour left for this; reusing ${borrowed}`,
            inferred: false,
          },
    );
    taken.add(assignments.at(-1)?.value ?? '');
  }

  assignments.sort((a, b) => CONTRACT_KEYS.indexOf(a.key) - CONTRACT_KEYS.indexOf(b.key));
  return { assignments, unused: tokens.filter((t) => !claimed.has(t.name)) };
};

const WEIGHTS: readonly (readonly [RegExp, number])[] = [
  [/extrabold|extra-bold|ultrabold/i, 800],
  [/semibold|semi-bold|demibold/i, 600],
  [/extralight|extra-light|ultralight/i, 200],
  [/thin|hairline/i, 100],
  [/light/i, 300],
  [/regular|book|normal/i, 400],
  [/medium/i, 500],
  [/bold/i, 700],
  [/black|heavy/i, 900],
];

export interface FontCandidate {
  family: string;
  files: { path: string; weight: number; style: 'normal' }[];
}

/**
 * Groups font files by family, reading the weight out of the filename.
 *
 * satori needs one buffer per weight and substitutes silently when one is missing, so an
 * enumerated list is the only safe form. Italic files are skipped rather than guessed at:
 * nothing in the token contract references an italic face yet, and a wrong style is the same
 * class of silent error as a wrong weight.
 */
export const groupFontFiles = (paths: readonly string[]): FontCandidate[] => {
  const families = new Map<string, FontCandidate>();

  for (const path of paths) {
    const base = path.split('/').at(-1) ?? '';
    const stem = base.replace(/\.(ttf|otf)$/i, '');
    if (/italic|oblique/i.test(stem)) continue;

    const weight = WEIGHTS.find(([pattern]) => pattern.test(stem))?.[1];
    if (weight === undefined) continue;

    const family = (stem.split(/[-_]/)[0] ?? stem).trim();
    if (family === '') continue;

    const entry = families.get(family) ?? { family, files: [] };
    if (!entry.files.some((f) => f.weight === weight)) {
      entry.files.push({ path, weight, style: 'normal' });
    }
    families.set(family, entry);
  }

  return [...families.values()]
    .map((f) => ({ ...f, files: f.files.sort((a, b) => a.weight - b.weight) }))
    .sort((a, b) => b.files.length - a.files.length);
};
