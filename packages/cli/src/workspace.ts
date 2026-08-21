import { join, relative } from 'node:path';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import {
  applyConfig,
  createDefaultRegistries,
  type AssetSpec,
  type Constraint,
  type MediakitConfig,
  type Registries,
} from '@mediakit/core';

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
