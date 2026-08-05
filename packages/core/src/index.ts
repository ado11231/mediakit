/**
 * The public API of @mediakit/core. Anything not exported here is internal and may change
 * in a patch release. Exports are listed by name rather than re-exported wholesale so that
 * adding a file cannot silently widen the contract.
 */

export { h } from './element.js';
export type { Child, Element, ElementProps, Style, StyleValue } from './element.js';

export {
  MediakitError,
  duplicateRegistration,
  formatLocation,
  missingSlot,
  unexpectedSlot,
  unknownRegistryKey,
  unknownSlot,
} from './errors.js';
export type { SpecLocation } from './errors.js';

export { Registry } from './registry/registry.js';
export { createBlockRegistry, defineBlock } from './registry/block.js';
export type { BlockDefinition, BlockEntry, BlockRenderer } from './registry/block.js';
export { assertSlot, createLayoutRegistry, defineLayout } from './registry/layout.js';
export type { LayoutContent, LayoutDefinition, LayoutRenderer } from './registry/layout.js';
export { createFrameRegistry, defineFrame } from './registry/frame.js';
export type { FrameDefinition, FrameRenderer } from './registry/frame.js';
export { createPresetRegistry, LISTING_PRESETS, SOCIAL_PRESETS } from './registry/preset.js';
export type { Constraint, Preset } from './registry/preset.js';
export { createDefaultRegistries, createRegistries } from './registry/registries.js';
export type { Registries } from './registry/registries.js';

export type { RenderContext } from './render/context.js';

export {
  assetSpecSchema,
  blockSchema,
  frameSchema,
  parseSpec,
  presetNames,
} from './spec/schema.js';
export type { AssetSpec, BlockSpec, FrameSpec } from './spec/schema.js';

export {
  DEFAULT_COLOR,
  DEFAULT_RADIUS,
  DEFAULT_SCALE,
  DEFAULT_SPACE,
  DEFAULT_TYPE,
} from './tokens/defaults.js';
export { colorToken, radiusToken, spaceToken, typeToken } from './tokens/access.js';
export { DEFAULT_FONT } from './tokens/default-font.js';
export { resolveTokens } from './tokens/resolve.js';
export type {
  FontFile,
  FontSource,
  FontTokens,
  ResolvedTokens,
  TokensInput,
  TypeStyle,
} from './tokens/contract.js';

export { applyConfig, defineConfig } from './config.js';
export type { BrandRules, MediakitConfig } from './config.js';

export { checkAsset, checkSpec, parsePng } from './check/index.js';
export type { Violation } from './check/index.js';
