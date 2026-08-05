import type { BlockEntry } from './registry/block.js';
import type { FrameDefinition } from './registry/frame.js';
import type { LayoutDefinition } from './registry/layout.js';
import type { Preset } from './registry/preset.js';
import type { Registries } from './registry/registries.js';
import type { TokensInput } from './tokens/contract.js';

/**
 * Voice enforced by a validator rather than a style guide nobody reads. These belong to the
 * consumer's config and never to a block's schema, so that a project which wants an
 * exclamation mark can have one without forking a package.
 */
export interface BrandRules {
  noExclamations?: boolean;
  maxHeadline?: number;
  forbiddenWords?: readonly string[];
}

export interface MediakitConfig {
  tokens: TokensInput;
  blocks?: Readonly<Record<string, BlockEntry>>;
  layouts?: Readonly<Record<string, LayoutDefinition>>;
  presets?: Readonly<Record<string, Preset>>;
  frames?: Readonly<Record<string, FrameDefinition>>;
  brandRules?: BrandRules;
  /** Where rendered assets are written. Relative to the config file. */
  outDir?: string;
}

/**
 * Registration is data the consumer wrote, not a side effect of importing a module. An
 * imperative `registerBlock` call has to live somewhere, and importing that module to
 * trigger it is exactly the import-time side effect `sideEffects: false` forbids: it
 * defeats tree-shaking and makes load order significant.
 */
export const defineConfig = (config: MediakitConfig): MediakitConfig => config;

export const applyConfig = (registries: Registries, config: MediakitConfig): Registries => {
  if (config.presets !== undefined) registries.presets.registerAll(config.presets);
  if (config.layouts !== undefined) registries.layouts.registerAll(config.layouts);
  if (config.blocks !== undefined) registries.blocks.registerAll(config.blocks);
  if (config.frames !== undefined) registries.frames.registerAll(config.frames);
  return registries;
};
