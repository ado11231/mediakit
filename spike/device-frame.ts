import { h, type Element, type Style } from './h.ts';

/**
 * Ratios carried over from the reference render (280x570 body, radius 40, bezel 9,
 * notch 90x24). Only the ratios transfer: roadmap.md:104 records that the reference's
 * absolute spacing was tuned for a 390pt phone viewport and is wrong on a 1080px canvas.
 * Everything below derives from WIDTH so the proportions survive any target size, which
 * is the `scale` idea from design.md reduced to one constant.
 */
const REFERENCE_WIDTH = 280;
const REFERENCE_HEIGHT = 570;
const REFERENCE_RADIUS = 40;
const REFERENCE_BEZEL = 9;
const REFERENCE_NOTCH_WIDTH = 90;
const REFERENCE_NOTCH_HEIGHT = 24;

export const deviceGeometry = (width: number) => {
  const scale = width / REFERENCE_WIDTH;
  const round = (n: number) => Math.round(n * scale);
  return {
    width,
    height: round(REFERENCE_HEIGHT),
    radius: round(REFERENCE_RADIUS),
    bezel: round(REFERENCE_BEZEL),
    notchWidth: round(REFERENCE_NOTCH_WIDTH),
    notchHeight: round(REFERENCE_NOTCH_HEIGHT),
  };
};

interface DeviceFrameProps {
  width: number;
  bezelColor: string;
  screenColor: string;
  screen: Element;
}

export const DeviceFrame = ({
  width,
  bezelColor,
  screenColor,
  screen,
}: DeviceFrameProps): Element => {
  const g = deviceGeometry(width);

  const body: Style = {
    display: 'flex',
    position: 'relative',
    width: g.width,
    height: g.height,
    padding: g.bezel,
    borderRadius: g.radius,
    backgroundColor: bezelColor,
    // Spread-only ring plus a cast shadow. Both forms are confirmed supported
    // (roadmap.md:151); a ring is the only way to fake a second bezel edge without
    // a nested element, since satori ignores outline.
    boxShadow: `0 0 0 2px rgba(255,255,255,0.06), 0 40px 80px rgba(0,0,0,0.45)`,
  };

  const viewport: Style = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    borderRadius: g.radius - g.bezel,
    backgroundColor: screenColor,
    overflow: 'hidden',
  };

  const notch: Style = {
    display: 'flex',
    position: 'absolute',
    // Flush with the top of the viewport rather than the device body, so the notch
    // reads as cut out of the screen. An absolutely positioned child anchors to the
    // padding box, so this offset is the bezel rather than zero.
    top: g.bezel,
    left: '50%',
    // satori supports percentage translate, so the notch stays centred without
    // needing the parent width in the arithmetic.
    transform: 'translateX(-50%)',
    width: g.notchWidth,
    height: g.notchHeight,
    borderBottomLeftRadius: Math.round(g.notchHeight / 2),
    borderBottomRightRadius: Math.round(g.notchHeight / 2),
    backgroundColor: bezelColor,
  };

  return h('div', body, h('div', viewport, screen), h('div', notch));
};
