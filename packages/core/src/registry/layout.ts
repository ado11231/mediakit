import type { Element } from '../element.js';
import { missingSlot, unexpectedSlot, unknownSlot, type SpecLocation } from '../errors.js';
import type { RenderContext } from '../render/context.js';
import { Registry } from './registry.js';

export interface LayoutContent {
  /** Every block of the frame, in spec order. What a slotless layout arranges. */
  blocks: readonly Element[];
  /** Populated only for layouts that declare slots. Keys are the declared slot names. */
  slots: Readonly<Record<string, readonly Element[]>>;
}

export type LayoutRenderer = (content: LayoutContent, context: RenderContext) => Element;

export interface LayoutDefinition {
  /** Empty means the layout arranges blocks in order and rejects any `slot`. */
  slots: readonly string[];
  still?: LayoutRenderer;
  video?: LayoutRenderer;
}

export const defineLayout = (definition: LayoutDefinition): LayoutDefinition => definition;

export const createLayoutRegistry = (): Registry<LayoutDefinition> =>
  new Registry<LayoutDefinition>('layout');

/**
 * Stricter than the closed `'left' | 'right' | 'main'` union it replaces, which accepted
 * `right` on a `centered` frame and silently ignored it. Both directions are errors here:
 * a slot the layout does not declare, and a missing slot on a layout that declares some.
 */
export const assertSlot = (
  layoutName: string,
  layout: LayoutDefinition,
  slot: string | undefined,
  location?: SpecLocation,
): void => {
  if (layout.slots.length === 0) {
    if (slot !== undefined) throw unexpectedSlot(layoutName, slot, location);
    return;
  }

  if (slot === undefined) throw missingSlot(layoutName, location);
  if (!layout.slots.includes(slot)) throw unknownSlot(layoutName, slot, layout.slots, location);
};
