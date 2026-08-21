import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runExport } from '../src/index.js';

const MINIMAL_CONFIG = `export default { tokens: { color: { accent: '#2563EB' } } };`;

const frame = (text: string): unknown => ({
  layout: 'centered',
  blocks: [{ type: 'Headline', props: { text, align: 'center' } }],
});

const spec = (id: string, preset: string | string[], frames = 1): string =>
  JSON.stringify({
    id,
    preset,
    frames: Array.from({ length: frames }, (_, i) => frame(`frame ${String(i + 1)}`)),
  });

interface Manifest {
  spec: string;
  preset: string;
  width: number;
  height: number;
  frames: { file: string; bytes: number; sha256: string }[];
  verified: string[];
}

describe('runExport', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-export-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const setup = async (id: string, preset: string | string[], frames = 1): Promise<string> => {
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', `${id}.spec.json`),
      spec(id, preset, frames),
      'utf8',
    );
    return `marketing/${id}.spec.json`;
  };

  it('writes ordered filenames and a manifest per preset', async () => {
    const specPath = await setup('launch', ['ig-portrait', 'story'], 2);
    const code = await runExport([specPath], { cwd: dir });
    expect(code).toBe(0);

    for (const preset of ['ig-portrait', 'story']) {
      const bundle = join(dir, 'export', 'launch', preset);
      expect(await readdir(bundle)).toEqual([
        'launch-01.png',
        'launch-02.png',
        'manifest.json',
      ]);
    }
  });

  it('records a sha256 per frame that matches the bytes on disk', async () => {
    const specPath = await setup('launch', 'ig-portrait', 2);
    expect(await runExport([specPath], { cwd: dir })).toBe(0);

    const bundle = join(dir, 'export', 'launch', 'ig-portrait');
    const manifest = JSON.parse(
      await readFile(join(bundle, 'manifest.json'), 'utf8'),
    ) as Manifest;

    expect(manifest.frames).toHaveLength(2);
    for (const entry of manifest.frames) {
      const png = await readFile(join(bundle, entry.file));
      expect(createHash('sha256').update(png).digest('hex')).toBe(entry.sha256);
      expect(png.length).toBe(entry.bytes);
    }
  });

  /**
   * The manifest is an artifact like any rendered PNG, so a timestamp or a version string in
   * it would break invariant 7 exactly as a dated watermark would: bytes that change while
   * the spec does not. Asserted rather than left to review, since it is the kind of field
   * that gets added helpfully.
   */
  it('writes a manifest with no clock-dependent field', async () => {
    const specPath = await setup('launch', 'ig-portrait', 1);
    expect(await runExport([specPath], { cwd: dir })).toBe(0);

    const raw = await readFile(
      join(dir, 'export', 'launch', 'ig-portrait', 'manifest.json'),
      'utf8',
    );
    expect(Object.keys(JSON.parse(raw) as Manifest).sort()).toEqual([
      'frames',
      'height',
      'preset',
      'spec',
      'verified',
      'width',
    ]);
    expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('re-exporting the same spec reproduces the bundle byte for byte', async () => {
    const specPath = await setup('launch', 'ig-portrait', 2);
    expect(await runExport([specPath], { cwd: dir })).toBe(0);
    const first = await readFile(
      join(dir, 'export', 'launch', 'ig-portrait', 'manifest.json'),
      'utf8',
    );
    expect(await runExport([specPath], { cwd: dir })).toBe(0);
    const second = await readFile(
      join(dir, 'export', 'launch', 'ig-portrait', 'manifest.json'),
      'utf8',
    );
    expect(second).toBe(first);
  });

  it('records the constraints it verified', async () => {
    const specPath = await setup('store', 'ios-6.9', 1);
    expect(await runExport([specPath], { cwd: dir })).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(dir, 'export', 'store', 'ios-6.9', 'manifest.json'), 'utf8'),
    ) as Manifest;
    expect(manifest.verified).toEqual(['no alpha channel', '1-10 frames']);
    expect(manifest.width).toBe(1320);
    expect(manifest.height).toBe(2868);
  });

  /**
   * The bundle is what a person drags into an upload form, so a half-written one is worse
   * than none: it uploads without complaint. play-phone requires at least two frames, so a
   * one-frame spec is rejected before anything reaches disk.
   */
  it('writes nothing when a constraint fails', async () => {
    const specPath = await setup('store', 'play-phone', 1);
    const code = await runExport([specPath], { cwd: dir });
    expect(code).toBe(1);
    expect(existsSync(join(dir, 'export'))).toBe(false);
  });

  it('clears a stale frame left by a longer previous export', async () => {
    const specPath = await setup('launch', 'ig-portrait', 2);
    expect(await runExport([specPath], { cwd: dir })).toBe(0);
    expect(existsSync(join(dir, 'export', 'launch', 'ig-portrait', 'launch-02.png'))).toBe(
      true,
    );

    await writeFile(
      join(dir, 'marketing', 'launch.spec.json'),
      spec('launch', 'ig-portrait', 1),
      'utf8',
    );
    expect(await runExport([specPath], { cwd: dir })).toBe(0);
    expect(await readdir(join(dir, 'export', 'launch', 'ig-portrait'))).toEqual([
      'launch-01.png',
      'manifest.json',
    ]);
  });

  /**
   * export runs the same spec rules as check, so a glyph the font cannot draw stops a bundle
   * before it is written. This is what makes "upload the folder as it is" true rather than
   * hopeful.
   */
  it('refuses to write a bundle whose text the font cannot draw', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), MINIMAL_CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'tofu.spec.json'),
      JSON.stringify({
        id: 'tofu',
        preset: 'ig-portrait',
        frames: [
          {
            layout: 'centered',
            blocks: [{ type: 'Headline', props: { text: '日本語 🎉', align: 'center' } }],
          },
        ],
      }),
      'utf8',
    );
    expect(await runExport(['marketing/tofu.spec.json'], { cwd: dir })).toBe(1);
    expect(existsSync(join(dir, 'export'))).toBe(false);
  });

  it('rejects a --preset the spec does not name', async () => {
    const specPath = await setup('launch', 'ig-portrait', 1);
    const code = await runExport([specPath, '--preset', 'story'], { cwd: dir });
    expect(code).toBe(1);
    expect(existsSync(join(dir, 'export'))).toBe(false);
  });

  it('honours --out', async () => {
    const specPath = await setup('launch', 'ig-portrait', 1);
    expect(await runExport([specPath, '--out', 'upload'], { cwd: dir })).toBe(0);
    expect(existsSync(join(dir, 'upload', 'launch', 'ig-portrait', 'launch-01.png'))).toBe(
      true,
    );
  });
});
