import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import {
  applyConfig,
  checkFrame,
  createDefaultRegistries,
  parseSpec,
  type AssetSpec,
  type Registries,
  type TokensInput,
  type Violation,
} from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../src/index.js';

const tokens: TokensInput = { color: { accent: '#2563EB' } };

const registries = (): Registries =>
  applyConfig(createDefaultRegistries(), {
    tokens,
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
    frames: BUILTIN_FRAMES,
  });

/**
 * The rule reads a real render rather than a hand-written SVG on purpose. What it can get
 * wrong is satori's output shape: which paths are glyphs, where a transform lands, what a
 * clamped box reports. A fixture string would freeze today's answer to all three and pass
 * forever after satori changed any of them.
 */
const overflow = async (
  frames: AssetSpec['frames'],
  preset = 'ig-portrait',
): Promise<Violation[]> => {
  const spec = parseSpec({ id: 'overflow', preset, frames }, 'overflow.spec.json');
  const built = registries();
  const entry = built.presets.get(preset, { file: 'overflow.spec.json' });
  const rendered = await renderSpec({
    spec,
    registries: built,
    tokens,
    preset,
    file: 'overflow.spec.json',
  });

  const violations = rendered.flatMap((frame) =>
    checkFrame({
      svg: frame.svg,
      textBoxes: frame.textBoxes,
      width: entry.width,
      height: entry.height,
      preset,
      file: 'overflow.spec.json',
      frameIndex: frame.index,
    }),
  );

  return violations.filter((v) => v.message.startsWith('overflow:'));
};

describe('checkOverflow', () => {
  /**
   * The case `split` documents and cannot fix: one word wider than a column can ever be.
   * satori clamps the box, paints the glyphs past it, and reports nothing.
   */
  it('catches display type too wide for a split column', async () => {
    const [violation, ...rest] = await overflow([
      {
        layout: 'split',
        blocks: [
          { type: 'Headline', slot: 'left', props: { text: 'Uninterruptible' } },
          { type: 'Body', slot: 'right', props: { text: 'Beside it.' } },
        ],
      },
    ]);

    expect(rest).toHaveLength(0);
    expect(violation?.message).toContain('"Uninterruptible"');
    expect(violation?.message).toMatch(/\d+px wider than the \d+px box/);
    expect(violation?.frameIndex).toBe(0);
  });

  /**
   * A warning, not an error. Text bled past an edge is sometimes the design, and an
   * error-level rule that fires on it would break an existing consumer's build on upgrade.
   */
  it('reports at warning severity', async () => {
    const [violation] = await overflow([
      {
        layout: 'split',
        blocks: [{ type: 'Headline', slot: 'left', props: { text: 'Uninterruptible' } }],
      },
    ]);
    expect(violation?.severity).toBe('warning');
  });

  /**
   * A layout that lets a box grow to its content hides the previous case: nothing is clamped,
   * so nothing is wider than its box. The text still leaves the canvas, and those pixels are
   * simply not in the PNG.
   */
  it('names the edges when text is painted off the canvas', async () => {
    const [violation, ...rest] = await overflow([
      { layout: 'centered', blocks: [{ type: 'Body', props: { text: 'Fits fine.' } }] },
      {
        layout: 'centered',
        blocks: [{ type: 'Headline', props: { text: 'Uninterruptiblebackgroundsync' } }],
      },
    ]);

    expect(rest).toHaveLength(0);
    // The frame reaches the reader through `frameIndex`, which the CLI renders for every
    // rule. The message used to spell it out as well, which is why some rules said "frame N"
    // and others silently did not.
    expect(violation?.frameIndex).toBe(1);
    expect(violation?.message).toMatch(
      /\d+px past the left edge and \d+px past the right edge of the 1080x1350 canvas/,
    );
  });

  /**
   * The false-positive gate, and the reason the rule is horizontal only: every built-in block
   * at its default size, none of which overflows anything.
   */
  it('says nothing about text that fits', async () => {
    expect(
      await overflow([
        {
          layout: 'stack',
          blocks: [
            { type: 'Eyebrow', props: { text: 'Now shipping' } },
            { type: 'Headline', props: { text: 'Track it' } },
            { type: 'Subhead', props: { text: 'One place for the work' } },
            { type: 'Body', props: { text: 'Everything in one view.' } },
            { type: 'BulletList', props: { items: ['First', 'Second'] } },
            { type: 'Stat', props: { value: '4x', label: 'faster' } },
            { type: 'CTA', props: { text: 'Get it' } },
            { type: 'Caption', props: { text: 'Small print' } },
          ],
        },
      ]),
    ).toEqual([]);
  });
});
