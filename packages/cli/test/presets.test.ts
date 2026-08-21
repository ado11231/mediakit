import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { runPresets } from '../src/index.js';

const capture = async (fn: () => Promise<number>): Promise<{ code: number; out: string }> => {
  let out = '';
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    });
  try {
    return { code: await fn(), out };
  } finally {
    spy.mockRestore();
  }
};

describe('runPresets', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-presets-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /**
   * Listing what mediakit can render is useful before a project exists, so this is the one
   * command that must not require `init` first.
   */
  it('lists the built-ins with no config present', async () => {
    const { code, out } = await capture(() => runPresets([], { cwd: dir }));
    expect(code).toBe(0);
    expect(out).toMatch(/ios-6\.9\s+1320x2868\s+listing/);
    expect(out).toMatch(/ig-portrait\s+1080x1350\s+social/);
    expect(out).toMatch(/github-social\s+1280x640\s+web/);
  });

  it('names the constraints check and export enforce', async () => {
    const { out } = await capture(() => runPresets([], { cwd: dir }));
    expect(out).toContain('no alpha channel, 1-10 frames');
    expect(out).toContain('2-8 frames, 320-3840px per side, at most 2:1');
  });

  /**
   * A consumer's own preset appearing here is the only confirmation available that their
   * registration took effect, short of rendering.
   */
  it('shows a preset registered by the config, labelled custom', async () => {
    await writeFile(
      join(dir, 'mediakit.config.js'),
      `export default {
         tokens: { color: { accent: '#2563EB' } },
         presets: { 'my-card': { width: 800, height: 600, renderer: 'still', scale: 2 } },
       };`,
      'utf8',
    );
    const { code, out } = await capture(() => runPresets([], { cwd: dir }));
    expect(code).toBe(0);
    expect(out).toMatch(/my-card\s+800x600\s+custom/);
  });

  it('fails loudly on a --config path that does not exist', async () => {
    await expect(runPresets(['--config', 'nope.ts'], { cwd: dir })).rejects.toThrow(
      /No mediakit config at/,
    );
  });
});
