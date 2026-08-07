import { join } from 'node:path';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import {
  applyConfig,
  createDefaultRegistries,
  type AssetSpec,
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
