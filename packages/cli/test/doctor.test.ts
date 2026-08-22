import { mkdtemp, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { runDoctor, runCheck } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const GEIST = join(here, '../../core/fonts/Geist-Regular.ttf');
const GEIST_BOLD = join(here, '../../core/fonts/Geist-Bold.ttf');

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

describe('runDoctor', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-doctor-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const config = async (body: string): Promise<void> => {
    await writeFile(join(dir, 'mediakit.config.js'), body, 'utf8');
  };

  it('passes on a minimal config and reports the registries', async () => {
    await config(`export default { tokens: { color: { accent: '#2563EB' } } };`);
    const { code, out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(code).toBe(0);
    expect(out).toMatch(/pass\s+config/);
    expect(out).toMatch(/pass\s+font Geist/);
    expect(out).toContain('all checks passed');
  });

  /**
   * Most first-run failures are one of four things, and each currently surfaces as a throw at
   * render time instead of as a checklist. A missing config is the commonest.
   */
  it('fails with the remedy when no config resolves', async () => {
    const { code, out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(code).toBe(1);
    expect(out).toContain('mediakit init');
  });

  it('fails when a declared font file is not on disk', async () => {
    await config(`export default {
      tokens: {
        color: { accent: '#2563EB' },
        font: {
          display: { family: 'Ghost', files: [{ path: '/nope/Ghost-Regular.ttf', weight: 400 }] },
          body: { family: 'Ghost', files: [{ path: '/nope/Ghost-Regular.ttf', weight: 400 }] },
        },
      },
    };`);
    const { code, out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(code).toBe(1);
    expect(out).toContain('not on disk');
  });

  /** satori substitutes a missing weight silently, which is the worst outcome on the table. */
  it('fails when the loaded weights do not cover the type scale', async () => {
    const fonts = join(dir, 'fonts');
    await mkdir(fonts, { recursive: true });
    await copyFile(GEIST, join(fonts, 'Solo-Regular.ttf'));
    await config(`export default {
      tokens: {
        color: { accent: '#2563EB' },
        font: {
          display: { family: 'Solo', files: [{ path: ${JSON.stringify(join(fonts, 'Solo-Regular.ttf'))}, weight: 400 }] },
          body: { family: 'Solo', files: [{ path: ${JSON.stringify(join(fonts, 'Solo-Regular.ttf'))}, weight: 400 }] },
        },
      },
    };`);
    const { code, out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(code).toBe(1);
    expect(out).toContain('type scale needs 700');
  });

  it('reports glyph coverage for a font it can read', async () => {
    const fonts = join(dir, 'fonts');
    await mkdir(fonts, { recursive: true });
    await copyFile(GEIST, join(fonts, 'Pair-Regular.ttf'));
    await copyFile(GEIST_BOLD, join(fonts, 'Pair-Bold.ttf'));
    await config(`const files = [
      { path: ${JSON.stringify(join(fonts, 'Pair-Regular.ttf'))}, weight: 400 },
      { path: ${JSON.stringify(join(fonts, 'Pair-Bold.ttf'))}, weight: 700 },
    ];
    export default {
      tokens: {
        color: { accent: '#2563EB' },
        font: { display: { family: 'Pair', files }, body: { family: 'Pair', files } },
      },
    };`);
    const { code, out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(code).toBe(0);
    expect(out).toMatch(/pass\s+glyphs\s+\d+ codepoints/);
  });

  /**
   * The number nothing else in the CLI shows. A type scale authored for an app viewport
   * renders at a fraction of a listing canvas, and the result validates, exports, and uploads.
   */
  it('prints the type scale resolved per listing preset', async () => {
    await config(`export default { tokens: { color: { accent: '#2563EB' } } };`);
    const { out } = await capture(() => runDoctor([], { cwd: dir }));
    expect(out).toContain('type scale, resolved per preset');
    expect(out).toMatch(/ios-6\.9\s+\d+\.\d%/);
    // Social presets are excluded: nothing is uploaded to a channel that rejects an asset.
    expect(out).not.toMatch(/^\s+ig-portrait/m);
  });
});

describe('runCheck warnings', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-warn-'));
    await writeFile(
      join(dir, 'mediakit.config.js'),
      `export default { tokens: { color: { accent: '#2563EB' } } };`,
      'utf8',
    );
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'store.spec.json'),
      JSON.stringify({
        id: 'store',
        preset: 'ios-6.9',
        frames: [
          { layout: 'centered', blocks: [{ type: 'Caption', props: { text: 'small print' } }] },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /**
   * A warning must not fail an existing consumer's build on upgrade. Sharpening a heuristic
   * is not a reason to break someone's pipeline.
   */
  it('exits 0 on a warning and says how to make it fail', async () => {
    const { code, out } = await capture(() =>
      runCheck(['marketing/store.spec.json'], { cwd: dir }),
    );
    expect(code).toBe(0);
    expect(out).toContain('warning');
    expect(out).toContain('--strict');
  });

  it('exits 1 on the same warning under --strict', async () => {
    const { code } = await capture(() =>
      runCheck(['marketing/store.spec.json', '--strict'], { cwd: dir }),
    );
    expect(code).toBe(1);
  });
});
