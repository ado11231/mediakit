import { createBlockRegistry, type BlockEntry } from './block.js';
import { createLayoutRegistry, type LayoutDefinition } from './layout.js';
import {
  createPresetRegistry,
  LISTING_PRESETS,
  SOCIAL_PRESETS,
  type Preset,
} from './preset.js';
import type { Registry } from './registry.js';

export interface Registries {
  blocks: Registry<BlockEntry>;
  layouts: Registry<LayoutDefinition>;
  presets: Registry<Preset>;
}

export const createRegistries = (): Registries => ({
  blocks: createBlockRegistry(),
  layouts: createLayoutRegistry(),
  presets: createPresetRegistry(),
});

/**
 * Built-in blocks and layouts are not seeded here. They live in `@mediakit/blocks`, which
 * depends on core, so core seeding them would invert the dependency. Presets are plain data
 * with no renderer, so they can live here without pulling anything in.
 */
export const createDefaultRegistries = (): Registries => {
  const registries = createRegistries();
  registries.presets.registerAll(SOCIAL_PRESETS);
  registries.presets.registerAll(LISTING_PRESETS);
  return registries;
};
