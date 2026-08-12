import { colorToken, defineFrame, h, type Element } from '@mediakit/core';
import { phoneChrome } from '../phone-chrome.js';

/**
 * Apple's Dynamic Island is 125x36pt inset 14pt from the top edge of a 440pt-wide 6.9-inch
 * display, which is what a 3x capture measures out to (376x110px at y=42 on a 1320px screen).
 * Expressed as fractions of the screen width so the island tracks the bezel at any render size.
 *
 * The inset matters as much as the size: a pill flush against the top edge reads as a notch
 * from an older device, not as an island.
 */
const ISLAND_WIDTH = 125 / 440;
const ISLAND_HEIGHT = 36 / 440;
const ISLAND_TOP = 14 / 440;

/** Fixes the island's proportions when the screen declares no numeric width. */
const NOMINAL_WIDTH = 240;

/**
 * A phone bezel plus a drawn Dynamic Island, for screen content that has no status bar of its
 * own: app UI composed from blocks and tokens rather than captured from a device.
 *
 * Pointing this at a real screenshot draws a second island over the captured one. `phone` is
 * the frame for captures.
 */
export const phoneNotch = defineFrame({
  still: (child, context) => {
    const { device, screen, bezel, screenWidth } = phoneChrome(child, context);
    const width = screenWidth ?? NOMINAL_WIDTH;

    const island: Element = h('div', {
      style: {
        position: 'absolute',
        top: bezel + Math.round(width * ISLAND_TOP),
        left: '50%',
        transform: 'translateX(-50%)',
        width: Math.round(width * ISLAND_WIDTH),
        height: Math.round(width * ISLAND_HEIGHT),
        borderRadius: Math.round(width * ISLAND_HEIGHT),
        backgroundColor: colorToken(context.tokens, 'bezel'),
      },
    });

    return h('div', { style: device }, h('div', { style: screen }, child), island);
  },
});
