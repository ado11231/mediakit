import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { BUILTIN_BLOCKS, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import {
  applyConfig,
  createDefaultRegistries,
  parseSpec,
  type AssetSpec,
  type Registries,
  type TokensInput,
} from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../src/index.js';

const run = promisify(execFile);
const HARNESS = fileURLToPath(new URL('./harness.mjs', import.meta.url));

const tokens: TokensInput = { color: { accent: '#2563EB' } };

const registries = (): Registries =>
  applyConfig(createDefaultRegistries(), {
    tokens,
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
  });

const spec = (frames: AssetSpec['frames']): AssetSpec =>
  parseSpec({ id: 'fixture', preset: 'ig-portrait', frames }, 'fixture.spec.json');

const render = (frames: AssetSpec['frames'], preset = 'ig-portrait') =>
  renderSpec({
    spec: spec(frames),
    registries: registries(),
    tokens,
    preset,
    file: 'fixture.spec.json',
  });

const sha = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

/** PNG IHDR carries the dimensions at a fixed offset, so no image library is needed. */
const size = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

const headline = (text: string) => ({ type: 'Headline', props: { text } });

describe('rendering a spec', () => {
  it('produces a PNG at the exact dimensions of the preset', async () => {
    const [frame] = await render([{ layout: 'centered', blocks: [headline('Ship it')] }]);

    expect(frame).toBeDefined();
    expect(size(frame?.png ?? Buffer.alloc(0))).toEqual({ width: 1080, height: 1350 });
  });

  it('honours a different preset from the same spec', async () => {
    const [frame] = await render(
      [{ layout: 'centered', blocks: [headline('Ship it')] }],
      'story',
    );

    expect(size(frame?.png ?? Buffer.alloc(0))).toEqual({ width: 1080, height: 1920 });
  });

  it('renders every layout without a satori throw', async () => {
    const frames = await render([
      { layout: 'centered', blocks: [headline('Centered')] },
      { layout: 'stack', blocks: [headline('Stacked')] },
      { layout: 'fullBleed', blocks: [headline('Full bleed')] },
      {
        layout: 'split',
        blocks: [
          { type: 'Headline', props: { text: 'Left', size: 'title' }, slot: 'left' },
          { type: 'Body', props: { text: 'Right' }, slot: 'right' },
        ],
      },
    ]);

    expect(frames).toHaveLength(4);
  }, 30_000);
});

describe('frame distinctness', () => {
  /**
   * The reference renderer shipped a bug for its entire life where every slide rendered as
   * slide 1: exit code 0, correctly named files, correct dimensions, no warnings. Nothing
   * but hashing the output could have caught it.
   */
  it('renders different frames to different bytes', async () => {
    const frames = await render([
      { layout: 'centered', blocks: [headline('Frame one')] },
      { layout: 'centered', blocks: [headline('Frame two')] },
      { layout: 'centered', blocks: [headline('Frame three')] },
    ]);

    const hashes = frames.map((frame) => sha(frame.png));
    expect(new Set(hashes).size).toBe(frames.length);
  }, 30_000);

  it('still renders a deliberately repeated frame identically', async () => {
    const frames = await render([
      { layout: 'centered', blocks: [headline('Same')] },
      { layout: 'centered', blocks: [headline('Same')] },
    ]);

    expect(sha(frames[0]?.png ?? Buffer.alloc(0))).toBe(sha(frames[1]?.png ?? Buffer.alloc(0)));
  }, 30_000);
});

describe('determinism', () => {
  /**
   * Two renders inside one process share satori's font cache and its module state, so they
   * cannot distinguish deterministic from cached. The M0 spike's own harness had exactly
   * this blind spot. Spawning is the only version of this assertion that means anything.
   */
  it('produces byte-identical output from a separate process', async () => {
    const [first, second] = await Promise.all([run('node', [HARNESS]), run('node', [HARNESS])]);

    expect(first.stdout.trim()).not.toBe('');
    expect(first.stdout).toBe(second.stdout);
  }, 60_000);
});

describe('failure behaviour', () => {
  it('throws when a type token names a weight the font does not ship', async () => {
    await expect(
      renderSpec({
        spec: spec([{ layout: 'centered', blocks: [headline('Ship it')] }]),
        registries: registries(),
        tokens: {
          ...tokens,
          type: { display: { fontSize: 34, fontWeight: 250, lineHeight: 1.1 } },
        },
        preset: 'ig-portrait',
        file: 'fixture.spec.json',
      }),
    ).rejects.toThrow(/type scale references 250/);
  });

  it('names the file and frame when a block type is not registered', async () => {
    await expect(
      render([{ layout: 'centered', blocks: [{ type: 'Headlien', props: {} }] }]),
    ).rejects.toThrow(/Unknown block "Headlien".*fixture\.spec\.json, frame 0/s);
  });

  it('rejects a slot the layout does not declare', async () => {
    await expect(
      render([
        {
          layout: 'centered',
          blocks: [{ type: 'Headline', props: { text: 'x' }, slot: 'left' }],
        },
      ]),
    ).rejects.toThrow(/declares no slots, but a block sets slot "left"/);
  });

  it('reports every invalid block prop at once, with the frame and block index', async () => {
    await expect(
      render([
        {
          layout: 'centered',
          blocks: [{ type: 'BulletList', props: { items: [], color: 7 } }],
        },
      ]),
    ).rejects.toThrow(/block 0 \(BulletList\)/);
  });
});
