import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  importConfig,
  needsStripTypesFlag,
  resolveConfigPath,
  stripTypesAvailable,
  stripTypesUnflagged,
} from '../src/index.js';
import { MediakitError } from '@mediakit/core';

describe('resolveConfigPath', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-config-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('throws with the prescribed message and the init suggestion when no config exists', () => {
    expect(() => resolveConfigPath(dir)).toThrow(MediakitError);
    expect(() => resolveConfigPath(dir)).toThrow(/No mediakit\.config\.ts found/);
    expect(() => resolveConfigPath(dir)).toThrow(/Run `mediakit init`/);
    expect(() => resolveConfigPath(dir)).toThrow(
      new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });

  it('returns the path of a present mediakit.config.js and skips the ts candidates', () => {
    return writeFile(join(dir, 'mediakit.config.js'), 'export default {};', 'utf8').then(() => {
      const resolved = resolveConfigPath(dir);
      expect(resolved).toBe(join(dir, 'mediakit.config.js'));
    });
  });

  it('prefers mediakit.config.ts over the .js candidate', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), 'export default {};', 'utf8');
    await writeFile(join(dir, 'mediakit.config.ts'), 'export default {};', 'utf8');
    expect(resolveConfigPath(dir)).toBe(join(dir, 'mediakit.config.ts'));
  });
});

describe('importConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-import-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the default export of a .js config', async () => {
    // `defineConfig` is identity, so a hand-written object literal is what the loader sees
    // either way. Avoiding the import keeps the temp dir off the workspace's node_modules.
    await writeFile(
      join(dir, 'mediakit.config.js'),
      `export default { tokens: { color: { accent: '#0a0a0a' } } };`,
      'utf8',
    );
    const config = await importConfig(join(dir, 'mediakit.config.js'));
    expect(config.tokens.color.accent).toBe('#0a0a0a');
  });

  it('returns the default export of a .ts config under vitest (which strips types itself)', async () => {
    await mkdir(join(dir, 'sub'), { recursive: true });
    await writeFile(
      join(dir, 'sub', 'mediakit.config.ts'),
      `export default { tokens: { color: { accent: '#11aabb' } } };`,
      'utf8',
    );
    const config = await importConfig(join(dir, 'sub', 'mediakit.config.ts'));
    expect(config.tokens.color.accent).toBe('#11aabb');
  });

  it('throws when the module has no default export', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), 'export const value = 1;', 'utf8');
    await expect(importConfig(join(dir, 'mediakit.config.js'))).rejects.toThrow(
      /Expected a default export of `defineConfig\({\.\.\.}\)`/,
    );
  });

  it('throws when the default export is not an object', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), 'export default "oops";', 'utf8');
    await expect(importConfig(join(dir, 'mediakit.config.js'))).rejects.toThrow(
      /received string/,
    );
  });
});

describe('needsStripTypesFlag', () => {
  it('returns false once the flag is already in execArgv', () => {
    expect(needsStripTypesFlag('v22.10.0', ['--experimental-strip-types'])).toBe(false);
  });

  it('returns true on a flag-shipping Node without the flag set', () => {
    expect(needsStripTypesFlag('v22.10.0', [])).toBe(true);
  });

  it('returns false on a Node where strip-types was unflagged', () => {
    expect(needsStripTypesFlag('v23.10.0', [])).toBe(false);
    expect(needsStripTypesFlag('v24.0.0', [])).toBe(false);
  });

  it('returns false on a Node that lacks the feature entirely', () => {
    expect(needsStripTypesFlag('v22.0.0', [])).toBe(false);
  });
});

describe('stripTypesAvailable / stripTypesUnflagged', () => {
  it('flags 22.6+ as available and 23.6+ as unflagged', () => {
    expect(stripTypesAvailable('v22.6.0')).toBe(true);
    expect(stripTypesAvailable('v22.5.0')).toBe(false);
    expect(stripTypesUnflagged('v23.6.0')).toBe(true);
    expect(stripTypesUnflagged('v23.5.0')).toBe(false);
    expect(stripTypesUnflagged('v22.10.0')).toBe(false);
  });
});
