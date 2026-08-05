import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runInit } from '../src/index.js';
import { parseSpec } from '@mediakit/core';

describe('runInit', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-init-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes mediakit.config.ts and an example spec and returns 0', async () => {
    const code = await runInit([dir]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'mediakit.config.ts'))).toBe(true);
    expect(existsSync(join(dir, 'marketing', 'example.spec.json'))).toBe(true);
  });

  it('writes a config that imports defineConfig and ships the bundled accent', async () => {
    await runInit([dir]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).toMatch(/import\s*\{[^}]*defineConfig[^}]*\}\s*from\s*'@mediakit\/core'/);
    expect(config).toContain("color: { accent: '#2563EB' }");
  });

  it('writes an example spec that parses to a single ig-portrait centered frame', async () => {
    await runInit([dir]);
    const text = await readFile(join(dir, 'marketing', 'example.spec.json'), 'utf8');
    const spec = parseSpec(JSON.parse(text), 'example.spec.json');
    expect(spec.id).toBe('example');
    expect(spec.preset).toBe('ig-portrait');
    expect(spec.frames).toHaveLength(1);
    expect(spec.frames[0]?.layout).toBe('centered');
  });

  it('the example spec uses only generic built-in blocks', async () => {
    await runInit([dir]);
    const text = await readFile(join(dir, 'marketing', 'example.spec.json'), 'utf8');
    const spec = parseSpec(JSON.parse(text), 'example.spec.json');
    const types = new Set(spec.frames.flatMap((f) => f.blocks.map((b) => b.type)));
    expect([...types].sort()).toEqual(['Body', 'Eyebrow', 'Headline']);
  });

  it('does not read a network credential or leave a manual copy step (no .env, no API key)', async () => {
    await runInit([dir]);
    expect(existsSync(join(dir, '.env'))).toBe(false);
    expect(existsSync(join(dir, '.env.local'))).toBe(false);
  });

  it('refuses to overwrite an existing mediakit.config.ts without --force', async () => {
    await writeFile(join(dir, 'mediakit.config.ts'), 'export default {};', 'utf8');
    const code = await runInit([dir]);
    expect(code).toBe(1);
  });

  it('overwrites when --force is passed', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'mediakit.config.ts'), 'export default { stale: true };', 'utf8');
    const code = await runInit([dir, '--force']);
    expect(code).toBe(0);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).not.toContain('stale');
    expect(config).toContain("color: { accent: '#2563EB' }");
  });

  it('prints --help and exits 0', async () => {
    const code = await runInit(['--help']);
    expect(code).toBe(0);
  });
});
