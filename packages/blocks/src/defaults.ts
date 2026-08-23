import type {
  BlockEntry,
  FrameDefinition,
  LayoutDefinition,
  TemplateDefinition,
} from '@mediakit/core';
import { Background } from './blocks/background.js';
import { Body } from './blocks/body.js';
import { BulletList } from './blocks/bullet-list.js';
import { Caption } from './blocks/caption.js';
import { CTA } from './blocks/cta.js';
import { DeviceFrame } from './blocks/device-frame.js';
import { Eyebrow } from './blocks/eyebrow.js';
import { Headline } from './blocks/headline.js';
import { Stat } from './blocks/stat.js';
import { Subhead } from './blocks/subhead.js';
import { none } from './frames/none.js';
import { phoneNotch } from './frames/phone-notch.js';
import { phone } from './frames/phone.js';
import { centered } from './layouts/centered.js';
import { screen as screenLayout } from './layouts/screen.js';
import { fullBleed } from './layouts/full-bleed.js';
import { split } from './layouts/split.js';
import { stack } from './layouts/stack.js';
import { carousel } from './templates/carousel.js';
import { listing } from './templates/listing.js';
import { screen as screenTemplate } from './templates/screen.js';

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
  Subhead,
  Body,
  BulletList,
  Stat,
  CTA,
  Caption,
  Background,
  DeviceFrame,
};

export const BUILTIN_LAYOUTS: Readonly<Record<string, LayoutDefinition>> = {
  centered,
  stack,
  split,
  fullBleed,
  screen: screenLayout,
};

export const BUILTIN_FRAMES: Readonly<Record<string, FrameDefinition>> = {
  none,
  phone,
  'phone-notch': phoneNotch,
};

/**
 * Recipes that write a spec, which `mediakit new` resolves by name. Generic only, for the same
 * reason the blocks are: a template naming a domain concept is a template for one app.
 */
export const BUILTIN_TEMPLATES: Readonly<Record<string, TemplateDefinition>> = {
  listing,
  carousel,
  screen: screenTemplate,
};
