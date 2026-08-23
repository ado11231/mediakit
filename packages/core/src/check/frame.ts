import { checkContrast } from './contrast.js';
import type { Violation } from './index.js';
import { checkOverflow, type FrameContext } from './overflow.js';
import { readFrame, type TextBox } from './svg.js';

/**
 * Every rule that reads a rendered frame rather than a spec, run over one parse of the SVG.
 *
 * These cannot live in `check`, which does not render and so has no geometry and no resolved
 * colours to read. They report from `render`, where the author is looking, and gate in
 * `export`, which is the last thing between a spec and an upload.
 */
export interface RenderedFrameCheck extends FrameContext {
  /** The satori SVG for the frame, which `renderFrame` returns beside the PNG. */
  readonly svg: string;
  readonly textBoxes: readonly TextBox[];
}

export const checkFrame = (input: RenderedFrameCheck): Violation[] => {
  const { svg, textBoxes, ...context } = input;
  const frame = readFrame(svg);

  return [
    ...checkOverflow(frame, textBoxes, context),
    ...checkContrast(frame, textBoxes, context),
  ];
};
