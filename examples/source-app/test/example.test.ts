import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runRender } from '@mediakit/cli';

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
