import { createBlockRegistry, type BlockEntry } from './block.js';
import { createFrameRegistry, type FrameDefinition } from './frame.js';
import { createLayoutRegistry, type LayoutDefinition } from './layout.js';
import {
  createPresetRegistry,
  LISTING_PRESETS,
  SOCIAL_PRESETS,
  WEB_PRESETS,
  type Preset,
} from './preset.js';
import type { Registry } from './registry.js';

export interface Registries {
  blocks: Registry<BlockEntry>;
  layouts: Registry<LayoutDefinition>;
  presets: Registry<Preset>;
  frames: Registry<FrameDefinition>;
}

export const createRegistries = (): Registries => ({
  blocks: createBlockRegistry(),
  layouts: createLayoutRegistry(),
  presets: createPresetRegistry(),
  frames: createFrameRegistry(),
});

/**
 * Built-in blocks, layouts, and frames are not seeded here. They live in `@mediakit/blocks`,
 * which depends on core, so core seeding them would invert the dependency. Presets are plain
 * data with no renderer, so they can live here without pulling anything in.
 */
export const createDefaultRegistries = (): Registries => {
  const registries = createRegistries();
  registries.presets.registerAll(SOCIAL_PRESETS);
  registries.presets.registerAll(LISTING_PRESETS);
  registries.presets.registerAll(WEB_PRESETS);
  return registries;
};
