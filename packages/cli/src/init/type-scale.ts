import { DEFAULT_SPACE, DEFAULT_TYPE, type TypeStyle } from '@mediakit/core';

/**
 * Type and spacing extraction for `init`, beside the colour extraction in `extract.ts` and
 * under the same contract: every value carries where it came from, and anything a stated rule
 * had to pick rather than read is marked a guess.
 *
 * Type is worth more than colour here. A palette with mediakit's default type scale still
 * reads as mediakit rather than as your product, because the ratios between display and body
 * are the part of a design system a reader recognises before they recognise a hue.
 */

/** One rung of a source's font-size ladder, in canvas-independent pixels. */
export interface TypeStep {
  name: string;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: string;
  fontWeight?: number;
}

export interface TypeAssignment {
  key: string;
  style: TypeStyle;
  source: string;
  inferred: boolean;
}

/**
 * A root font size has to be assumed to read `rem`, and 16px is both the browser default and
 * what every framework this reads from assumes. Stated here rather than buried so a project
 * that sets something else knows which number to correct.
 */
const ROOT_PX = 16;

export const toPx = (value: string): number | undefined => {
  const text = value.trim().toLowerCase();
  const match = /^(-?\d*\.?\d+)(rem|em|px)?$/.exec(text);
  if (match === null) return undefined;

  const size = Number(match[1]);
  if (!Number.isFinite(size)) return undefined;

  const unit = match[2];
  if (unit === 'rem' || unit === 'em') return size * ROOT_PX;
  return size;
};

const CUSTOM_PROPERTY = /--([\w-]+)\s*:\s*([^;}]+)[;}]/g;

const declarations = (source: string): Map<string, string> => {
  const found = new Map<string, string>();
  for (const [, name = '', value = ''] of source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(CUSTOM_PROPERTY)) {
    if (!found.has(name)) found.set(name, value.trim());
  }
  return found;
};

/**
 * Reads Tailwind v4's `--text-*` ladder, including the `--text-*--line-height`,
 * `--text-*--letter-spacing`, and `--text-*--font-weight` modifiers it hangs off each rung.
 * Those modifiers are the reason this is worth parsing at all: they carry the pairing a
 * designer chose, which a bare size ladder does not.
 */
export const parseCssTypeSteps = (source: string): TypeStep[] => {
  const declared = declarations(source);
  const steps: TypeStep[] = [];

  for (const [name, value] of declared) {
    if (!name.startsWith('text-') || name.includes('--')) continue;

    const fontSize = toPx(value);
    if (fontSize === undefined || fontSize <= 0) continue;

    const step: TypeStep = { name, fontSize };

    const lineHeight = toPx(declared.get(`${name}--line-height`) ?? '');
    if (lineHeight !== undefined) step.lineHeight = lineHeight;

    const letterSpacing = declared.get(`${name}--letter-spacing`);
    if (letterSpacing !== undefined) step.letterSpacing = letterSpacing;

    const fontWeight = Number(declared.get(`${name}--font-weight`));
    if (Number.isFinite(fontWeight) && fontWeight > 0) step.fontWeight = fontWeight;

    steps.push(step);
  }

  return steps.sort((a, b) => a.fontSize - b.fontSize);
};

/**
 * A token module names its scale however it likes, so this accepts both a flat number under a
 * type-ish key and an object carrying `fontSize`. Anything else is left alone: a module is
 * arbitrary code and guessing at its shape is how a wrong number reaches a config.
 */
export const parseModuleTypeSteps = (value: unknown, prefix = ''): TypeStep[] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];

  const out: TypeStep[] = [];
  const record = value as Record<string, unknown>;

  const size = record['fontSize'];
  const fontSize =
    typeof size === 'number' ? size : typeof size === 'string' ? toPx(size) : undefined;
  if (fontSize !== undefined && fontSize > 0 && prefix !== '') {
    const step: TypeStep = { name: prefix, fontSize };
    const lineHeight = record['lineHeight'];
    if (typeof lineHeight === 'number') {
      // A unitless line height is a multiple; anything larger is already a length.
      step.lineHeight = lineHeight <= 4 ? lineHeight * fontSize : lineHeight;
    }
    const weight = record['fontWeight'];
    if (typeof weight === 'number') step.fontWeight = weight;
    const tracking = record['letterSpacing'];
    if (typeof tracking === 'string') step.letterSpacing = tracking;
    return [step];
  }

  for (const [key, child] of Object.entries(record)) {
    const name = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'number' && child > 0 && /^(text|font-?size|type|size)/i.test(name)) {
      out.push({ name, fontSize: child });
      continue;
    }
    out.push(...parseModuleTypeSteps(child, name));
  }

  return out.sort((a, b) => a.fontSize - b.fontSize);
};

/** Where `body` anchors, tried in order before falling back to the rung nearest 16px. */
const BODY_NAMES = [/^text-base$/, /^base$/, /body$/, /^text-md$/, /^md$/, /^normal$/];

/**
 * Maps a source ladder onto the six roles in the token contract.
 *
 * Name matching cannot do this the way it does for colour: a ladder is named by size
 * (`text-xs` to `text-9xl`) and the contract is named by role. So `body` anchors to a named
 * rung, and every other role takes the rung nearest the ratio mediakit's own scale uses.
 * Adopting your rungs while keeping the shape of the scale is what makes the result look like
 * your product rather than like a resized default.
 *
 * `availableWeights` is not optional politeness. satori substitutes a missing weight silently,
 * so a scale naming a weight the loaded font does not ship renders wrong with no error at all,
 * which is the worst outcome on the failure table. Every weight is snapped to one that exists.
 */
export const mapTypeScale = (
  steps: readonly TypeStep[],
  availableWeights: readonly number[],
): TypeAssignment[] => {
  if (steps.length === 0) return [];

  const weights = [...availableWeights].sort((a, b) => a - b);
  const snap = (weight: number): number =>
    weights.reduce(
      (best, candidate) =>
        Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
      weights[0] ?? 400,
    );

  const nearest = (target: number): TypeStep =>
    steps.reduce((best, step) =>
      Math.abs(step.fontSize - target) < Math.abs(best.fontSize - target) ? step : best,
    );

  const named = BODY_NAMES.flatMap((pattern) =>
    steps.filter(
      (step) => pattern.test(step.name) || pattern.test(step.name.split('.').at(-1) ?? ''),
    ),
  );
  const body = named[0] ?? nearest(ROOT_PX);

  const defaultBody = DEFAULT_TYPE['body']?.fontSize ?? ROOT_PX;

  return Object.entries(DEFAULT_TYPE).map(([key, fallback]) => {
    const target = body.fontSize * (fallback.fontSize / defaultBody);
    const step = nearest(target);
    const drift = Math.abs(step.fontSize - target) / target;

    const style: TypeStyle = {
      fontSize: Math.round(step.fontSize),
      fontWeight: snap(step.fontWeight ?? fallback.fontWeight),
      lineHeight:
        step.lineHeight === undefined
          ? fallback.lineHeight
          : Math.round((step.lineHeight / step.fontSize) * 100) / 100,
    };

    const letterSpacing = toEm(step.letterSpacing, step.fontSize) ?? fallback.letterSpacing;
    if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;
    if (fallback.textTransform !== undefined) style.textTransform = fallback.textTransform;

    // A rung within a fifth of the target is the designer's own answer for that role. Further
    // than that and the ladder simply has no rung there, which a reviewer needs to be told.
    const inferred = drift <= 0.2;
    return {
      key,
      style,
      source: inferred
        ? step.name
        : `no rung near ${Math.round(target)}px; nearest is ${step.name} at ${Math.round(step.fontSize)}px`,
      inferred,
    };
  });
};

/** mediakit stores letter spacing em-relative, since that is what survives the jump in canvas. */
const toEm = (value: string | undefined, fontSize: number): string | undefined => {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (text.endsWith('em')) return text;
  const px = toPx(text);
  if (px === undefined || fontSize <= 0) return undefined;
  return `${Math.round((px / fontSize) * 1000) / 1000}em`;
};

export interface SpaceScale {
  values: Record<string, number>;
  base: number;
  source: string;
}

/**
 * Tailwind v4 replaced the spacing ladder with one base that every utility multiplies, so
 * there is usually a single number to read. mediakit's own ladder is that same grid at
 * 1, 2, 3, 4, 6, 8, 10, which is why a project on the default 0.25rem extracts to exactly the
 * defaults and this returns nothing rather than writing a block that changes nothing.
 */
const LADDER: readonly (readonly [string, number])[] = [
  ['xs', 1],
  ['sm', 2],
  ['md', 3],
  ['lg', 4],
  ['xl', 6],
  ['2xl', 8],
  ['3xl', 10],
];

export const parseCssSpacing = (source: string): SpaceScale | undefined => {
  const declared = declarations(source);

  const named = Object.fromEntries(
    LADDER.map(([key]) => [key, toPx(declared.get(`spacing-${key}`) ?? '')]).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, number>;

  if (Object.keys(named).length === LADDER.length) {
    return { values: named, base: named['xs'] ?? 0, source: '--spacing-* ladder' };
  }

  const base = toPx(declared.get('spacing') ?? '');
  if (base === undefined || base <= 0) return undefined;

  const values = Object.fromEntries(
    LADDER.map(([key, step]) => [key, Math.round(base * step)]),
  );
  const unchanged = LADDER.every(([key]) => values[key] === DEFAULT_SPACE[key]);
  return unchanged ? undefined : { values, base, source: '--spacing' };
};

export interface ScaleProposal {
  scale: number;
  reason: string;
}

/**
 * The multiplier that carries an app's type scale onto the canvas this project is being set up
 * for. Invariant 11 names this as `init`'s job and it has never been done: every project has
 * inherited a preset's default 2.5, which puts `caption` below the legibility floor on every
 * listing size. The arithmetic is the one `check` reports after the fact, run here where it can
 * still be written into a file a human reviews.
 *
 * Scoped to the one preset being scaffolded, and deliberately not to the widest registered one.
 * The floor is a fraction of a canvas's own width, so a 2064px tablet needs roughly twice the
 * multiplier a 1080px phone does; taking the largest would hand every project a scale that
 * renders display type at a quarter of the canvas. One canvas is a number that means something.
 * Presets carrying a width-proportional scale of their own is the real fix, and it is a
 * breaking change to every consumer's output rather than something to decide inside `init`.
 */
export const proposeScale = (
  type: Readonly<Record<string, TypeStyle>>,
  preset: { name: string; width: number; constrained: boolean },
  floorFraction: number,
): ScaleProposal | undefined => {
  if (!preset.constrained) return undefined;

  const smallest = Object.entries(type).sort((a, b) => a[1].fontSize - b[1].fontSize)[0];
  if (smallest === undefined) return undefined;

  const [tokenName, style] = smallest;
  const scale = Math.ceil(((preset.width * floorFraction) / style.fontSize) * 10) / 10;

  return {
    scale,
    reason:
      `type.${tokenName} at ${style.fontSize}px must clear ${(floorFraction * 100).toFixed(1)}% ` +
      `of ${preset.name}'s ${preset.width}px width to stay readable in a store gallery`,
  };
};
