import { defineFrame, h, type Element, type Style } from '@mediakit/core';

/**
 * A phone bezel sized proportionally to the screen content, not to a fixed design-system
 * number. A listing screenshot is framed inside a 1320x2868 canvas while a social slide
 * frames the same image at a quarter the width, so a bezel authored at one scale is wrong at
 * the other. Reading the child's resolved width keeps the chrome honest at any size.
 *
 * The notch pill sits at the top edge of the screen, overlaid on the screenshot, which is how
 * a phone presents. The frame owns it rather than leaving the screen to inset itself, the
 * split the M0 spike confirmed after the reference let the notch clip the eyebrow.
 */
const num = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;

export const phone = defineFrame({
  still: (child) => {
    const width = num(child.props.style?.width);
    const bezel = width === undefined ? 12 : Math.round(width * 0.04);
    const radius = width === undefined ? 44 : Math.round(width * 0.18);
    const notchW = width === undefined ? 90 : Math.round(width * 0.34);
    const notchH = width === undefined ? 24 : Math.round(width * 0.05);

    const deviceStyle: Style = {
      display: 'flex',
      position: 'relative',
      backgroundColor: '#0B0E14',
      padding: bezel,
      borderRadius: radius + bezel,
      boxShadow: `0 ${Math.round(bezel * 1.5)}px ${Math.round(bezel * 3)}px rgba(0,0,0,0.45)`,
    };

    const screenStyle: Style = {
      display: 'flex',
      overflow: 'hidden',
      borderRadius: radius,
    };

    const notch: Element = h('div', {
      style: {
        position: 'absolute',
        top: bezel,
        left: '50%',
        transform: 'translateX(-50%)',
        width: notchW,
        height: notchH,
        borderRadius: notchH,
        backgroundColor: '#0B0E14',
      },
    });

    return h('div', { style: deviceStyle }, h('div', { style: screenStyle }, child), notch);
  },
});
