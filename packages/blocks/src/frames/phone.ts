import { defineFrame, h } from '@mediakit/core';
import { phoneChrome } from '../phone-chrome.js';

/**
 * A phone bezel around the screen content, and nothing else.
 *
 * Deliberately no notch. A screenshot captured from a real device or simulator already
 * contains the status bar and the Dynamic Island, so a drawn pill stacks a second island on
 * top of the real one. Framing a real capture is the common case (see the "listing screenshots
 * are bring-your-own" contract in README.md), and a doubled island is the silent kind of wrong
 * that survives review: the render succeeds, the dimensions validate, and nothing reports it.
 *
 * Screens that genuinely have no status bar, meaning app UI composed from blocks rather than
 * captured, opt into the drawn island with `phone-notch`.
 */
export const phone = defineFrame({
  still: (child, context) => {
    const { device, screen } = phoneChrome(child, context);

    return h('div', { style: device }, h('div', { style: screen }, child));
  },
});
