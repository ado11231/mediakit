import { join, relative } from 'node:path';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import {
  applyConfig,
  checkGlyphs,
  checkSpec,
  createDefaultRegistries,
  glyphCoverage,
  resolveTokens,
  type AssetSpec,
  type Constraint,
  type Coverage,
  type MediakitConfig,
  type Registries,
  type Violation,
} from '@mediakit/core';
import { loadFonts } from '@mediakit/render-still';

/**
 * One construction shared by render, check, and preview. They each built their own before,
 * and they diverged: check omitted the consumer's registrations entirely, so a spec naming a
 * custom preset failed as unregistered under `check` while rendering fine under `render`.
 *
 * Built-ins seed first, so a custom block that reuses a built-in name surfaces as a
 * duplicateRegistration error rather than silently shadowing it. applyConfig mutates.
 */
export const buildRegistries = (config: MediakitConfig): Registries => {
  const registries = applyConfig(createDefaultRegistries(), {
    tokens: config.tokens,
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
    frames: BUILTIN_FRAMES,
  });
  applyConfig(registries, config);
  return registries;
};

/**
 * Where a rendered frame lands: 'marketing/<spec-id>/<preset>/frame-NN.png', flattened to
 * 'marketing/<spec-id>/frame-NN.png' when the spec declares exactly one preset.
 *
 * The layout is a property of the spec, never of the flags on this invocation. render used
 * to also nest whenever --preset was passed, which put a partial re-render in a different
 * directory from the full one and left check looking in an empty tree.
 */
export const outputDir = (
  outDir: string,
  spec: AssetSpec,
  preset: string,
  presets: readonly string[],
): string => (presets.length === 1 ? join(outDir, spec.id) : join(outDir, spec.id, preset));

/**
 * One-line human rendering of a channel constraint, shared by `presets` (which lists them)
 * and `export` (which records the ones it verified into the bundle manifest). Kept next to
 * the other shared CLI helpers so the two cannot drift into describing the same rule
 * differently.
 */
export const describeConstraint = (constraint: Constraint): string => {
  switch (constraint.kind) {
    case 'noAlpha':
      return 'no alpha channel';
    case 'frameCount':
      return `${constraint.min}-${constraint.max} frames`;
    case 'aspectRatio':
      return `at most ${constraint.maxRatio}:1`;
    case 'altSizes':
      return `also accepts ${constraint.sizes.map(([w, h]) => `${w}x${h}`).join(', ')}`;
    case 'sizeRange':
      return `${constraint.min}-${constraint.max}px per side`;
  }
};

/**
 * Paths are printed relative to cwd because that is what a person can paste back into the
 * next command. `--out` may point anywhere, though, and a relative path that climbs out of
 * cwd is strictly less readable than the absolute one it describes, so it loses.
 */
export const displayPath = (cwd: string, path: string): string => {
  const rel = relative(cwd, path);
  if (rel === '') return '.';
  return rel.startsWith('..') ? path : rel;
};

/**
 * Union of what every loaded font can draw, or `undefined` if any of them could not be
 * parsed. satori falls back across the fonts it is given, so the union is what actually
 * renders; one unparseable font makes the union an undercount, and an undercount would report
 * a violation against text the font draws perfectly well. Reporting nothing is the only safe
 * response to a parser limitation.
 *
 * Font files do not vary with the preset, so tokens resolve at any scale.
 */
const loadedCoverage = async (config: MediakitConfig): Promise<Coverage> => {
  const fonts = await loadFonts(resolveTokens(config.tokens, 1));
  const union = new Set<number>();
  for (const font of fonts) {
    const coverage = glyphCoverage(font.data);
    if (coverage === undefined) return undefined;
    for (const code of coverage) union.add(code);
  }
  return union;
};

/**
 * Every spec-level rule in one call, so `check` and `export` cannot enforce different sets.
 * They already diverged once over registries, which is why `buildRegistries` exists.
 */
export const checkSpecFully = async (
  spec: AssetSpec,
  registries: Registries,
  config: MediakitConfig,
  file: string,
): Promise<Violation[]> => [
  ...checkSpec(spec, registries, config.brandRules, file),
  ...checkGlyphs(spec, await loadedCoverage(config), file),
];
