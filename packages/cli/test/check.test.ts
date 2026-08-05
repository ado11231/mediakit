import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runCheck } from '../src/index.js';
import { runRender } from '../src/index.js';

const CONFIG = `export default { tokens: { color: { accent: '#2563EB' } }, brandRules: { noExclamations: true, maxHeadline: 80, forbiddenWords: ['revolutionary'] } };`;

const spec = (id: string, preset: string | string[], frames: unknown[]): string =>
  JSON.stringify({ id, preset, frames });

const headline = (text: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'Headline',
  props: { text, ...extra },
});

describe('runCheck spec mode', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-check-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('exits 0 on a clean spec', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'launch.spec.json'),
      spec('launch', 'ig-portrait', [{ layout: 'centered', blocks: [headline('Ship it')] }]),
      'utf8',
    );
    const code = await runCheck(['marketing/launch.spec.json'], { cwd: dir });
    expect(code).toBe(0);
  });

  it('exits 1 and reports an exclamation when noExclamations is on', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'launch.spec.json'),
      spec('launch', 'ig-portrait', [{ layout: 'centered', blocks: [headline('Ship it!')] }]),
      'utf8',
    );
    const code = await runCheck(['marketing/launch.spec.json'], { cwd: dir });
    expect(code).toBe(1);
  });

  it('exits 1 when a Play preset underflows the 2-frame minimum', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'store.spec.json'),
      spec('store', 'play-phone', [{ layout: 'centered', blocks: [] }]),
      'utf8',
    );
    const code = await runCheck(['marketing/store.spec.json'], { cwd: dir });
    expect(code).toBe(1);
  });

  it('reports a brand violation and a frame-count violation together, not just the first', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'store.spec.json'),
      spec('store', 'play-phone', [
        { layout: 'centered', blocks: [headline('revolutionary!')] },
      ]),
      'utf8',
    );
    expect(await runCheck(['marketing/store.spec.json'], { cwd: dir })).toBe(1);
  });

  it('pixel-checks rendered output when it exists and exits 1 on a wrong size', async () => {
    // Render a real PNG for ig-portrait, then check it against ios-6.9 (wrong dimensions).
    await writeFile(
      join(dir, 'mediakit.config.js'),
      `export default { tokens: { color: { accent: '#2563EB' } } };`,
      'utf8',
    );
    await mkdir(join(dir, 'marketing'), { recursive: true });
    const src = {
      id: 'ex',
      preset: 'ig-portrait',
      frames: [{ layout: 'centered', blocks: [headline('ok')] }],
    };
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), JSON.stringify(src), 'utf8');
    await runRender(['marketing/ex.spec.json'], { cwd: dir });
    expect(existsSync(join(dir, 'marketing', 'ex', 'frame-01.png'))).toBe(true);

    // Now check the same directory against ios-6.9 via asset mode.
    const code = await runCheck(['marketing/ex', '--preset', 'ios-6.9'], { cwd: dir });
    expect(code).toBe(1);
  }, 60_000);

  it('exits 0 in asset mode for an opaque PNG at the right size', async () => {
    await writeFile(
      join(dir, 'mediakit.config.js'),
      `export default { tokens: { color: { accent: '#2563EB' } } };`,
      'utf8',
    );
    await mkdir(join(dir, 'marketing'), { recursive: true });
    const src = {
      id: 'ex',
      preset: 'ig-portrait',
      frames: [{ layout: 'centered', blocks: [headline('ok')] }],
    };
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), JSON.stringify(src), 'utf8');
    await runRender(['marketing/ex.spec.json'], { cwd: dir });

    const code = await runCheck(['marketing/ex', '--preset', 'ig-portrait'], { cwd: dir });
    expect(code).toBe(0);
  }, 60_000);

  it('prints --help and exits 0', async () => {
    expect(await runCheck(['--help'], { cwd: dir })).toBe(0);
  });
});
