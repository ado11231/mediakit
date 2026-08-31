import type { Violation } from './index.js';
import { quote, type FrameContext } from './overflow.js';
import { matchBox, shapeBehind, type Frame, type TextBox } from './svg.js';

/**
 * Text a reader cannot make out against what is behind it.
 *
 * This is the "reads fine on my monitor" class: a muted grey on a dark page, or a brand colour
 * on a page tinted with the same brand colour, both of which look deliberate at desk brightness
 * and disappear on a phone in daylight. Nothing else in the pipeline can see it. The render
 * succeeds, the dimensions validate, and the type is the size it was asked to be.
 *
 * Both colours are read back out of the render rather than out of the tokens, because the token
 * pair a rule would guess at is frequently not the pair a reader sees: a `CTA` paints its own
 * pill and a card paints its own surface, so the background behind a line of text is whatever
 * was painted last under it, not the frame's `canvas`.
 */

/**
 * WCAG 2.1 AA, applied at its strict threshold to text of every size.
 *
 * The standard relaxes to 3:1 for large text, where large is defined by the size the reader
 * sees. A store gallery's display width is not published, which is the same reason the
 * legibility rule reports as a warning, so claiming the exemption would be claiming a number
 * this project has already said it does not have. The conservative direction is the strict
 * threshold, and reporting as a warning is what keeps that from being expensive.
 */
const AA_RATIO = 4.5;

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
};

/** `undefined` for anything not flatly opaque: a gradient, a fade, a colour space we do not read. */
const parseColor = (value: string): [number, number, number] | undefined => {
  const text = value.trim().toLowerCase();

  const named = NAMED[text];
  if (named !== undefined) return named;

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      if (hex.length === 4 && hex[3] !== 'f') return undefined;
      const channels = [0, 1, 2].map((i) => {
        const digit = hex[i] ?? '';
        return Number.parseInt(`${digit}${digit}`, 16);
      });
      return channels.some(Number.isNaN) ? undefined : (channels as [number, number, number]);
    }
    if (hex.length === 6 || hex.length === 8) {
      if (hex.length === 8 && hex.slice(6) !== 'ff') return undefined;
      const channels = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      return channels.some(Number.isNaN) ? undefined : (channels as [number, number, number]);
    }
    return undefined;
  }

  const call = /^rgba?\(([^)]*)\)$/.exec(text);
  if (call === null) return undefined;

  const parts = (call[1] ?? '')
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length > 3 && parts[3] !== 1) return undefined;

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
};

/** WCAG 2.1 relative luminance: sRGB channels linearised, then weighted for the eye. */
const luminance = ([r, g, b]: [number, number, number]): number => {
  const channel = (value: number): number => {
    const v = Math.min(Math.max(value, 0), 255) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrastRatio = (a: string, b: string): number | undefined => {
  const first = parseColor(a);
  const second = parseColor(b);
  if (first === undefined || second === undefined) return undefined;

  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
};

export const checkContrast = (
  frame: Frame,
  boxes: readonly TextBox[],
  context: FrameContext,
): Violation[] => {
  const { preset, file, frameIndex } = context;
  const violations: Violation[] = [];

  for (const run of frame.runs) {
    const box = matchBox(run, boxes);
    const rect = box ?? {
      left: run.ink.minX,
      top: run.ink.minY,
      width: run.ink.maxX - run.ink.minX,
      height: run.ink.maxY - run.ink.minY,
    };

    const behind = shapeBehind(rect, frame.shapes);
    if (behind?.fill === undefined) continue;

    const ratio = contrastRatio(run.fill, behind.fill);
    if (ratio === undefined || ratio >= AA_RATIO) continue;

    const what = box === undefined ? 'Text' : quote(box.text);
    violations.push({
      preset,
      file,
      frameIndex,
      severity: 'warning',
      message:
        `contrast: ${what} is ${run.fill} on ${behind.fill}, a ratio ` +
        `of ${ratio.toFixed(2)}:1. WCAG AA asks ${AA_RATIO}:1, and a store gallery is read on ` +
        `a phone in daylight rather than on the monitor this was authored on. Point that block ` +
        `at a colour token further from its background.`,
    });
  }

  return violations;
};
