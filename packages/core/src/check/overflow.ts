import type { Violation } from './index.js';
import { matchBox, TOLERANCE, type Frame, type TextBox } from './svg.js';

/**
 * Text that does not fit where it was laid out.
 *
 * satori clips and overflows without complaint. A headline one word too long for a `split`
 * column does not throw, does not warn, and does not shrink: yoga clamps the box to the column
 * while the glyphs paint straight past it, over whatever sits beside them or off the canvas
 * entirely. The render succeeds, `check` passes, and the asset uploads with a word cut in half.
 *
 * The box and the ink are separate artifacts and the rule needs both. Neither alone can see the
 * failure, which is why this is a rule over a rendered frame rather than a rule over a spec.
 *
 * Horizontal only, deliberately. Vertical bleed is a normal idiom: a device frame runs off the
 * bottom edge, a list continues past the fold of the screen it sits in, and flagging those
 * would make the rule noise that people learn to ignore. A line of text crossing the right edge
 * of its own box, or the side of the canvas, is a defect essentially every time.
 */

export interface FrameContext {
  readonly width: number;
  readonly height: number;
  readonly preset: string;
  readonly file: string;
  readonly frameIndex: number;
}

export const quote = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return JSON.stringify(collapsed.length > 40 ? `${collapsed.slice(0, 39)}…` : collapsed);
};

const ADVICE =
  'Point that block at a smaller type token, shorten the text, or give it more room.';

export const checkOverflow = (
  frame: Frame,
  boxes: readonly TextBox[],
  context: FrameContext,
): Violation[] => {
  const { width, height, preset, file, frameIndex } = context;
  const violations: Violation[] = [];

  for (const run of frame.runs) {
    const box = matchBox(run, boxes);
    const what = box === undefined ? 'Text' : quote(box.text);
    const where = `frame ${frameIndex + 1}`;

    const { painted } = run;
    if (painted !== undefined) {
      const overLeft = -painted.minX;
      const overRight = painted.maxX - width;
      if (Math.max(overLeft, overRight) > TOLERANCE) {
        const edges = [
          ...(overLeft > TOLERANCE ? [`${Math.round(overLeft)}px past the left edge`] : []),
          ...(overRight > TOLERANCE ? [`${Math.round(overRight)}px past the right edge`] : []),
        ].join(' and ');
        violations.push({
          preset,
          file,
          frameIndex,
          severity: 'warning',
          message:
            `overflow: ${where}, ${what} is drawn ${edges} of the ${width}x${height} ` +
            `canvas, so those pixels are not in the PNG. ${ADVICE}`,
        });
        continue;
      }
    }

    if (box === undefined) continue;

    const past = Math.max(run.ink.maxX - (box.left + box.width), box.left - run.ink.minX);
    if (past > TOLERANCE) {
      violations.push({
        preset,
        file,
        frameIndex,
        severity: 'warning',
        message:
          `overflow: ${where}, ${what} is ${Math.round(past)}px wider than the ` +
          `${Math.round(box.width)}px box it was laid out in, so it paints over whatever sits ` +
          `beside it, or is cut off if that box hides its overflow. ${ADVICE}`,
      });
    }
  }

  return violations;
};
