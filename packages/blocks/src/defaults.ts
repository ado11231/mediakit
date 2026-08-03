import type { BlockEntry, LayoutDefinition } from '@mediakit/core';
import { Body } from './blocks/body.js';
import { BulletList } from './blocks/bullet-list.js';
import { Eyebrow } from './blocks/eyebrow.js';
import { Headline } from './blocks/headline.js';
import { centered } from './layouts/centered.js';
import { fullBleed } from './layouts/full-bleed.js';
import { split } from './layouts/split.js';
import { stack } from './layouts/stack.js';

/**
 * A separate entry point rather than a package index, so that importing three blocks
 * directly does not drag the rest in. Anyone wiring up a default config wants all of them
 * and pays for all of them here; anyone hand-picking imports `@mediakit/blocks/block/<name>`
 * and pays for what they use.
 *
 * These are data, not registrations. Nothing is registered as a consequence of importing
 * this module, which is what `sideEffects: false` promises.
 */
export const BUILTIN_BLOCKS: Readonly<Record<string, BlockEntry>> = {
  Eyebrow,
  Headline,
  Body,
  BulletList,
};

export const BUILTIN_LAYOUTS: Readonly<Record<string, LayoutDefinition>> = {
  centered,
  stack,
  split,
  fullBleed,
};
