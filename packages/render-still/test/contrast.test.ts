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

/**
 * A palette with room in it, so a case that warns warns for the reason the test says and not
 * because the default accent is marginal against the default canvas.
 */
const tokens: TokensInput = {
  color: {
    accent: '#7FB2FF',
    canvas: '#0B0E14',
    surface: '#F5F7FA',
    ink: '#F5F7FA',
    inkMuted: '#9AA4B2',
    faint: '#1A1F2A',
  },
};

const contrast = async (
  frames: AssetSpec['frames'],
  input: TokensInput = tokens,
): Promise<Violation[]> => {
  const preset = 'ig-portrait';
  const spec = parseSpec({ id: 'contrast', preset, frames }, 'contrast.spec.json');
  const registries: Registries = applyConfig(createDefaultRegistries(), {
    tokens: input,
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
    frames: BUILTIN_FRAMES,
  });
  const entry = registries.presets.get(preset, { file: 'contrast.spec.json' });
  const rendered = await renderSpec({
    spec,
    registries,
    tokens: input,
    preset,
    file: 'contrast.spec.json',
  });

  return rendered
    .flatMap((frame) =>
      checkFrame({
        svg: frame.svg,
        textBoxes: frame.textBoxes,
        width: entry.width,
        height: entry.height,
        preset,
        file: 'contrast.spec.json',
        frameIndex: frame.index,
      }),
    )
    .filter((v) => v.message.startsWith('contrast:'));
};

describe('checkContrast', () => {
  /** The "reads fine on my monitor" case: a dark ink token on a nearly as dark page. */
  it('catches text too close in tone to what is behind it', async () => {
    const [violation, ...rest] = await contrast([
      {
        layout: 'centered',
        blocks: [{ type: 'Headline', props: { text: 'Barely there', color: 'faint' } }],
      },
    ]);

    expect(rest).toHaveLength(0);
    expect(violation?.message).toContain('"Barely there"');
    expect(violation?.message).toContain('#1A1F2A on #0B0E14');
    expect(violation?.message).toMatch(/ratio of 1\.\d+:1/);
    expect(violation?.severity).toBe('warning');
  });

  /**
   * The reason both colours are read back out of the render rather than out of the tokens. A
   * `CTA` paints its own pill, so the pair a reader sees is the label against the pill, not
   * the label against the frame's canvas. Against the canvas this same block reads as a
   * comfortable 15:1 and nothing would be reported.
   */
  it('measures a label against the surface its own block paints', async () => {
    const [violation, ...rest] = await contrast([
      {
        layout: 'centered',
        blocks: [
          { type: 'CTA', props: { text: 'Start now', background: 'surface', color: 'ink' } },
        ],
      },
    ]);

    expect(rest).toHaveLength(0);
    expect(violation?.message).toContain('"Start now"');
    expect(violation?.message).toContain('#F5F7FA on #F5F7FA');
  });

  it('says nothing about a palette with room in it', async () => {
    expect(
      await contrast([
        {
          layout: 'stack',
          blocks: [
            { type: 'Eyebrow', props: { text: 'Now shipping' } },
            { type: 'Headline', props: { text: 'Track it' } },
            { type: 'Body', props: { text: 'Everything in one view.' } },
            { type: 'Caption', props: { text: 'Small print' } },
          ],
        },
      ]),
    ).toEqual([]);
  });

  /**
   * Silence rather than a guess. A gradient has no single colour behind a line of text, and
   * reporting the ratio against one end of it would be reporting a number that is true
   * nowhere on the canvas.
   */
  it('says nothing when the background is not one flat colour', async () => {
    expect(
      await contrast([
        {
          layout: 'centered',
          blocks: [
            {
              type: 'Background',
              props: { gradient: { from: 'canvas', to: 'faint' } },
            },
            { type: 'Headline', props: { text: 'Over a gradient', color: 'faint' } },
          ],
        },
      ]),
    ).toEqual([]);
  });
});
