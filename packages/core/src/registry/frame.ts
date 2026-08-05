import type { Element } from '../element.js';
import { Registry } from './registry.js';
import type { RenderContext } from '../render/context.js';

/**
 * A device chrome: the bezel, notch, and safe-area insets that wrap a screenshot. One block
 * (`DeviceFrame`) resolves its `chrome` prop against this registry, so adding a laptop or a
 * bezel-less variant is a registration rather than a core change, the same shape as blocks and
 * layouts.
 *
 * The renderer receives the already-rendered screen content (an `<img>` of the supplied
 * screenshot) and returns the framed element. It owns the safe-area inset, which is the split
 * the M0 spike confirmed: the reference left it to the screen component and the notch clipped
 * the eyebrow. See roadmap.md "What the never-before-rendered slides showed".
 */
export type FrameRenderer = (child: Element, context: RenderContext) => Element;

export interface FrameDefinition {
  still?: FrameRenderer;
  video?: FrameRenderer;
}

export const defineFrame = (definition: FrameDefinition): FrameDefinition => definition;

export const createFrameRegistry = (): Registry<FrameDefinition> =>
  new Registry<FrameDefinition>('frame');
