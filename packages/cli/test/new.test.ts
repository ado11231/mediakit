import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSpec } from '@mediakit/core';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runNew } from '../src/index.js';

const MINIMAL_CONFIG = `export default { tokens: { color: { accent: '#2563EB' } } };`;

/**
 * A template registered from a consumer config, which is the same code a stranger writes. A
 * registry only ever exercised by its own built-ins grows assumptions that hold for core and
 * fail for everyone else, and nothing reports it.
 */
const CONFIG_WITH_TEMPLATE = `export default {
  tokens: { color: { accent: '#2563EB' } },
  templates: {
    'release-note': {
      description: 'One frame per shipped thing',
      presets: ['ig-square'],
      frames: { min: 1, max: 4, default: 2 },
      build: ({ id, presets, frames }) => ({
        id,
        preset: presets[0],
        frames: Array.from({ length: frames }, (_, i) => ({
          layout: 'centered',
          blocks: [{ type: 'Headline', props: { text: 'Shipped ' + (i + 1) } }],
        })),
      }),
    },
  },
};`;

describe('runNew', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-new-'));
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const read = async (id: string): Promise<unknown> =>
    JSON.parse(await readFile(join(dir, 'marketing', `${id}.spec.json`), 'utf8'));

  it('writes a spec that parses, at the frame count the template proposes', async () => {
    expect(await runNew(['deck', '--template', 'carousel'], { cwd: dir })).toBe(0);

    const spec = parseSpec(await read('deck'), 'deck.spec.json');
    expect(spec.id).toBe('deck');
    expect(spec.frames).toHaveLength(5);
  });

  // Naming a spec after the template it came from is the most natural thing to type, and it
  // used to fail: flag values were matched by string, so the id was discarded as if it were
  // the value of --template, and the error asked for an id that had been supplied.
  it('accepts an id that says the same thing as the template it names', async () => {
    expect(await runNew(['listing', '--template', 'listing'], { cwd: dir })).toBe(0);

    const spec = parseSpec(await read('listing'), 'listing.spec.json');
    expect(spec.id).toBe('listing');
  });

  it('accepts an id that says the same thing as --preset', async () => {
    expect(await runNew(['ig-square', '--preset', 'ig-square'], { cwd: dir })).toBe(0);
    expect((await read('ig-square')) as { id: string }).toMatchObject({ id: 'ig-square' });
  });

  it('honours --frames and --preset', async () => {
    await runNew(['deck', '--frames', '3', '--preset', 'ig-square'], { cwd: dir });

    const spec = parseSpec(await read('deck'), 'deck.spec.json');
    expect(spec.frames).toHaveLength(3);
    expect(spec.preset).toBe('ig-square');
  });

  it('numbers a carousel so the last frame carries the count', async () => {
    await runNew(['deck', '--frames', '4'], { cwd: dir });
    const raw = JSON.stringify(await read('deck'));
    expect(raw).toContain('01 / 04');
    expect(raw).toContain('04 / 04');
  });

  /** The failure table: an unknown registry key names what is registered instead. */
  it('throws for an unknown template and lists the registered ones', async () => {
    await expect(runNew(['deck', '--template', 'nope'], { cwd: dir })).rejects.toThrow(
      /carousel/,
    );
  });

  it('rejects a frame count outside the template range, naming the range', async () => {
    const code = await runNew(['deck', '--template', 'carousel', '--frames', '99'], {
      cwd: dir,
    });
    expect(code).toBe(1);
  });

  it('refuses to overwrite an existing spec without --force', async () => {
    await runNew(['deck'], { cwd: dir });
    expect(await runNew(['deck'], { cwd: dir })).toBe(1);
    expect(await runNew(['deck', '--force'], { cwd: dir })).toBe(0);
  });

  it('exits 1 when --screen names a file that is not there', async () => {
    const code = await runNew(['store', '--template', 'listing', '--screen', 'nope.png'], {
      cwd: dir,
    });
    expect(code).toBe(1);
  });

  /**
   * Sizing the device needs the screen's aspect, so `new` reads its header. A file that is not
   * a PNG has to say so here rather than at render time, three commands later.
   */
  it('reports a --screen that is not a PNG', async () => {
    await mkdir(join(dir, 'captures'), { recursive: true });
    await writeFile(join(dir, 'captures', 'fake.png'), 'not a png', 'utf8');
    await expect(
      runNew(['store', '--template', 'listing', '--screen', 'captures/fake.png'], { cwd: dir }),
    ).rejects.toThrow(/not a PNG/);
  });

  it('resolves a template registered from a consumer config', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG_WITH_TEMPLATE, 'utf8');
    expect(await runNew(['notes', '--template', 'release-note'], { cwd: dir })).toBe(0);

    const spec = parseSpec(await read('notes'), 'notes.spec.json');
    expect(spec.frames).toHaveLength(2);
    expect(JSON.stringify(spec)).toContain('Shipped 1');
  });

  it('prints --help and exits 0', async () => {
    expect(await runNew(['--help'], { cwd: dir })).toBe(0);
  });
});
