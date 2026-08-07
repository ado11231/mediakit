import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

/**
 * Every other CLI test calls runCheck/runRender directly and asserts the number they return.
 * That left the layer which turns that number into a process exit code untested, and it did
 * not do it: `mediakit check` reported violations and exited 0, so a CI job gated on it went
 * green on a spec that would have been rejected at upload.
 *
 * These spawn the real binary. It is the only way to observe an exit code.
 */
const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

const run = (args: readonly string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

const CONFIG = `export default { tokens: { color: { accent: '#2563EB' } }, brandRules: { noExclamations: true } };`;

const spec = (blocks: unknown[]): string =>
  JSON.stringify({ id: 'x', preset: 'ig-portrait', frames: [{ layout: 'centered', blocks }] });

describe('bin exit codes', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-bin-'));
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('exits 0 on a clean spec', async () => {
    await writeFile(
      join(dir, 'x.spec.json'),
      spec([{ type: 'Headline', props: { text: 'Ship it' } }]),
      'utf8',
    );
    expect(run(['check', 'x.spec.json'], dir).status).toBe(0);
  });

  it('exits non-zero when check reports a violation', async () => {
    await writeFile(
      join(dir, 'x.spec.json'),
      spec([{ type: 'Headline', props: { text: 'Ship it!' } }]),
      'utf8',
    );
    const result = run(['check', 'x.spec.json'], dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('noExclamations');
  });

  it('exits non-zero on an unknown command', () => {
    expect(run(['nope'], dir).status).toBe(1);
  });

  it('exits non-zero when a spec file is missing', () => {
    expect(run(['check', 'absent.spec.json'], dir).status).toBe(1);
  });

  it('exits non-zero when render is given no spec', () => {
    expect(run(['render'], dir).status).toBe(1);
  });

  it('exits 0 on --help', () => {
    expect(run(['--help'], dir).status).toBe(0);
  });
});
