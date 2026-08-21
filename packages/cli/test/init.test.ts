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

  it('writes a config that imports defineConfig from the installed `mediakit` package', async () => {
    await runInit([dir]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    // The scaffold must import from the one package a newcomer installs, not a transitive
    // dependency: pnpm's strict layout would refuse to resolve `@mediakit/core` by name.
    expect(config).toMatch(/import\s*\{[^}]*defineConfig[^}]*\}\s*from\s*'mediakit'/);
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

describe('runInit --from', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-init-from-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const css = `:root {
    --bg-base: #FBFAF7;
    --bg-surface: #FFFFFF;
    --accent: #2563A8;
    --text-primary: #1A1A17;
    --text-secondary: #55534C;
    --success: #1F5E2E;
    --destructive: #8F2A1E;
  }`;

  const writeCss = async (): Promise<string> => {
    const path = join(dir, 'tokens.css');
    await writeFile(path, css, 'utf8');
    return path;
  };

  /**
   * Invariant 11 justifies inference only because a human reviews what it wrote, and a
   * reviewer cannot check a hex value without knowing where it came from. The comments are
   * the feature: they survive into the committed file and into code review, where the
   * terminal output does not.
   */
  it('records the source token beside every inferred colour', async () => {
    await runInit([dir, '--from', await writeCss()]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).toContain("accent:   '#2563A8', // from accent");
    expect(config).toContain("canvas:   '#FBFAF7', // from bg-base");
    expect(config).toContain("ink:      '#1A1A17', // from text-primary");
  });

  it('marks a value it could not derive as a GUESS in the file', async () => {
    await runInit([dir, '--from', await writeCss()]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).toMatch(/bezel:\s+'#[0-9a-fA-F]{6}', \/\/ GUESS:/);
  });

  /**
   * `init` must leave the project in a state `render` consumes immediately. loadFonts throws
   * on a weight the type scale names, so a discovered family that ships only 500 and 600
   * would scaffold a config that cannot render. Falling back to the bundled font is correct.
   */
  it('ignores a font family that does not cover the default type scale', async () => {
    const fonts = join(dir, 'fonts');
    await mkdir(fonts, { recursive: true });
    await writeFile(join(fonts, 'Partial-Medium.ttf'), '', 'utf8');
    await writeFile(join(fonts, 'Partial-SemiBold.ttf'), '', 'utf8');

    await runInit([dir, '--from', await writeCss(), '--fonts', fonts]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).not.toContain('Partial');
    expect(config).not.toContain('font:');
  });

  it('uses a font family that does cover it, enumerating every weight', async () => {
    const fonts = join(dir, 'fonts');
    await mkdir(fonts, { recursive: true });
    for (const name of ['Acme-Regular.ttf', 'Acme-Medium.ttf', 'Acme-Bold.ttf']) {
      await writeFile(join(fonts, name), '', 'utf8');
    }

    await runInit([dir, '--from', await writeCss(), '--fonts', fonts]);
    const config = await readFile(join(dir, 'mediakit.config.ts'), 'utf8');
    expect(config).toContain("family: 'Acme'");
    expect(config).toContain('weight: 400');
    expect(config).toContain('weight: 500');
    expect(config).toContain('weight: 700');
  });

  it('scaffolds the example spec at --preset', async () => {
    await runInit([dir, '--preset', 'ios-6.9']);
    const text = await readFile(join(dir, 'marketing', 'example.spec.json'), 'utf8');
    expect(parseSpec(JSON.parse(text), 'example.spec.json').preset).toBe('ios-6.9');
  });

  it('exits 1 when --from names a file that does not exist', async () => {
    expect(await runInit([dir, '--from', join(dir, 'nope.css')])).toBe(1);
  });

  it('exits 1 when the source carries no colours', async () => {
    const path = join(dir, 'empty.css');
    await writeFile(path, ':root { --spacing-md: 12px; }', 'utf8');
    expect(await runInit([dir, '--from', path])).toBe(1);
  });

  it('throws with a usable message on an unsupported source format', async () => {
    const path = join(dir, 'tokens.yaml');
    await writeFile(path, 'accent: "#fff"', 'utf8');
    await expect(runInit([dir, '--from', path])).rejects.toThrow(/expected a .css file/);
  });
});
