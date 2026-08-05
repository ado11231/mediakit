import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runRender } from '../src/index.js';
import { MediakitError } from '@mediakit/core';

const MINIMAL_CONFIG = `export default { tokens: { color: { accent: '#2563EB' } } };`;

const spec = (id: string, preset: string | string[], headline = 'hi'): string =>
  JSON.stringify({
    id,
    preset,
    frames: [
      {
        layout: 'centered',
        blocks: [{ type: 'Headline', props: { text: headline, align: 'center' } }],
      },
    ],
  });

const pngWidth = (buffer: Buffer): number => buffer.readUInt32BE(16);
const pngHeight = (buffer: Buffer): number => buffer.readUInt32BE(20);

describe('runRender', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-render-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const setup = async (
    specId: string,
    preset: string | string[],
    text = 'hi',
  ): Promise<string> => {
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    const path = join(dir, 'marketing', `${specId}.spec.json`);
    await writeFile(path, spec(specId, preset, text), 'utf8');
    return `marketing/${specId}.spec.json`;
  };

  it('writes a PNG at the preset dimensions for a single-preset spec (flat output)', async () => {
    const specPath = await setup('example', 'ig-portrait');
    const code = await runRender([specPath], { cwd: dir });
    expect(code).toBe(0);
    const out = join(dir, 'marketing', 'example', 'frame-01.png');
    expect(existsSync(out)).toBe(true);
    const png = await readFile(out);
    expect(pngWidth(png)).toBe(1080);
    expect(pngHeight(png)).toBe(1350);
  }, 30_000);

  it('writes nested output under <preset> for a multi-preset spec', async () => {
    const specPath = await setup('launch', ['ig-portrait', 'story']);
    const code = await runRender([specPath], { cwd: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'marketing', 'launch', 'ig-portrait', 'frame-01.png'))).toBe(
      true,
    );
    expect(existsSync(join(dir, 'marketing', 'launch', 'story', 'frame-01.png'))).toBe(true);
  }, 30_000);

  it('--preset renders only the named preset, still nested', async () => {
    const specPath = await setup('launch', ['ig-portrait', 'story']);
    const code = await runRender([specPath, '--preset', 'story'], { cwd: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'marketing', 'launch', 'story', 'frame-01.png'))).toBe(true);
    expect(existsSync(join(dir, 'marketing', 'launch', 'ig-portrait', 'frame-01.png'))).toBe(
      false,
    );
  }, 30_000);

  it('rejects --preset when its value is not one the spec declares', async () => {
    const specPath = await setup('example', 'ig-portrait');
    const code = await runRender([specPath, '--preset', 'story'], { cwd: dir });
    expect(code).toBe(1);
  });

  it('throws the failure-table message when no mediakit.config is present', async () => {
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'example.spec.json'),
      spec('example', 'ig-portrait'),
      'utf8',
    );
    await expect(
      runRender(['marketing/example.spec.json'], { cwd: dir }),
    ).rejects.toBeInstanceOf(MediakitError);
    await expect(runRender(['marketing/example.spec.json'], { cwd: dir })).rejects.toThrow(
      /No mediakit\.config\.ts found/,
    );
  });

  it('returns 1 when no spec path is given', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
    const code = await runRender([], { cwd: dir });
    expect(code).toBe(1);
  });

  it('returns 1 when the spec path is missing on disk', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
    const code = await runRender(['marketing/does-not-exist.spec.json'], { cwd: dir });
    expect(code).toBe(1);
  });
});
