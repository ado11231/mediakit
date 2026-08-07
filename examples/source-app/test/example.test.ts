import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runCheck, runRender } from '@mediakit/cli';

const cwd = fileURLToPath(new URL('../', import.meta.url));

/**
 * examples/source-app is a test, not a demo. If this stops rendering, the extension API
 * broke, since the spec exercises a custom block, a custom layout, and a custom preset
 * registered from outside @mediakit/core.
 */
describe('source-app extension API', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'example-render-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const pngSize = (buffer: Buffer) => ({
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  });

  it('renders the spec end to end at the registered custom preset dimensions', async () => {
    const code = await runRender(['marketing/launch.spec.json', '--out', outDir], { cwd });
    expect(code).toBe(0);

    const path = join(outDir, 'launch', 'frame-01.png');
    expect(existsSync(path)).toBe(true);
    const png = await readFile(path);
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
  }, 30_000);

  it('reproduces the committed PNG byte for byte (the example-level determinism gate)', async () => {
    const code = await runRender(['marketing/launch.spec.json', '--out', outDir], { cwd });
    expect(code).toBe(0);

    const fresh = await readFile(join(outDir, 'launch', 'frame-01.png'));
    const committed = await readFile(join(cwd, 'marketing', 'launch', 'frame-01.png'));
    const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
    expect(sha(fresh)).toBe(sha(committed));
  }, 30_000);
});

/**
 * The M2 gate: the source app's store assets, generated end to end and validated against the
 * channel's own rules. Two frames at two listing sizes, where frame 1 composes a rendered app
 * screen inside a DeviceFrame, which is the shape a real listing takes.
 *
 * This is the test that caught the renderer emitting RGBA. resvg always encodes colour type 6,
 * and no golden ever ran a real render against a preset carrying noAlpha, so `check` passed on
 * synthetic fixtures while the actual output would have been rejected at upload.
 */
describe('source-app store assets', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'example-store-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const pngSize = (buffer: Buffer) => ({
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  });
  const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

  it('renders both listing presets at their exact store dimensions', async () => {
    expect(await runRender(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);

    const ios = await readFile(join(outDir, 'store', 'ios-6.9', 'frame-01.png'));
    const play = await readFile(join(outDir, 'store', 'play-phone', 'frame-01.png'));
    expect(pngSize(ios)).toEqual({ width: 1320, height: 2868 });
    expect(pngSize(play)).toEqual({ width: 1080, height: 1920 });
  }, 120_000);

  it('renders distinct bytes per frame', async () => {
    expect(await runRender(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);

    const dir = join(outDir, 'store', 'ios-6.9');
    const one = sha(await readFile(join(dir, 'frame-01.png')));
    const two = sha(await readFile(join(dir, 'frame-02.png')));
    expect(one).not.toBe(two);
  }, 120_000);

  it('emits a 24-bit PNG for presets whose channel rejects an alpha channel', async () => {
    expect(await runRender(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);

    // Byte 25 is the IHDR colour type. 2 is truecolour without alpha; 6 is what resvg emits.
    const ios = await readFile(join(outDir, 'store', 'ios-6.9', 'frame-01.png'));
    expect(ios.readUInt8(25)).toBe(2);

    // play-phone declares no noAlpha, so it keeps resvg's own encoding untouched.
    const play = await readFile(join(outDir, 'store', 'play-phone', 'frame-01.png'));
    expect(play.readUInt8(25)).toBe(6);
  }, 120_000);

  it('passes check against the store constraints', async () => {
    expect(await runRender(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);
    expect(await runCheck(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);
  }, 120_000);

  it('reproduces the committed store assets byte for byte', async () => {
    expect(await runRender(['marketing/store.spec.json', '--out', outDir], { cwd })).toBe(0);

    for (const preset of ['ios-6.9', 'play-phone']) {
      for (const frame of ['frame-01.png', 'frame-02.png']) {
        const fresh = await readFile(join(outDir, 'store', preset, frame));
        const committed = await readFile(join(cwd, 'marketing', 'store', preset, frame));
        expect(sha(fresh), `${preset}/${frame}`).toBe(sha(committed));
      }
    }
  }, 120_000);
});
