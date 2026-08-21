import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { runSchema } from '../src/index.js';

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

/**
 * A scratch directory has no node_modules, so the config cannot resolve `@mediakit/core` or
 * `zod` by name the way a real consumer's would. Resolving them here to absolute URLs keeps
 * the test exercising the real `import()` path in `importConfig` rather than a stub.
 */
const CONFIG = `import { defineBlock, defineLayout, h } from '${import.meta.resolve('@mediakit/core')}';
import { z } from '${import.meta.resolve('zod')}';
export default {
  tokens: { color: { accent: '#2563EB', brandInk: '#101010' } },
  blocks: {
    PricingCard: defineBlock({
      schema: z.object({ tier: z.string(), price: z.string() }),
      still: () => h('div', {}),
    }),
  },
  layouts: { 'pricing-split': defineLayout({ slots: ['headline', 'card'], still: () => h('div', {}) }) },
  presets: { 'my-card': { width: 800, height: 600, renderer: 'still', scale: 2 } },
};`;

describe('runSchema', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-schema-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('emits JSON Schema for the built-ins with no config present', async () => {
    const { code, out } = await capture(() => runSchema([], { cwd: dir }));
    expect(code).toBe(0);
    const schema = JSON.parse(out) as Record<string, Record<string, unknown>>;
    expect(schema['$defs']?.['frame_centered']).toBeDefined();
    expect(schema['$defs']?.['block_Headline']).toBeDefined();
  });

  /**
   * Invariant 5 end to end: a block, layout, and preset registered in a config must reach the
   * generated vocabulary with no further work. The old implementation's hand-maintained
   * catalog is what this exists to prevent coming back.
   */
  it('includes a block, layout, preset, and colour token registered by the config', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    const { code, out } = await capture(() => runSchema([], { cwd: dir }));
    expect(code).toBe(0);
    const schema = JSON.parse(out) as Record<string, Record<string, unknown>>;

    expect(schema['$defs']?.['frame_pricing-split']).toBeDefined();
    expect(schema['$defs']?.['block_pricing-split_PricingCard']).toBeDefined();

    const preset = (schema['properties']?.['preset'] as Record<string, unknown>)['oneOf'];
    expect((preset as Record<string, unknown>[])[0]?.['enum']).toContain('my-card');

    const frame = schema['$defs']?.['frame_centered'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(frame['properties']?.['background']?.['enum']).toContain('brandInk');
  });

  it('emits prose with --format md', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    const { code, out } = await capture(() => runSchema(['--format', 'md'], { cwd: dir }));
    expect(code).toBe(0);
    expect(out).toContain('# mediakit spec vocabulary');
    expect(out).toContain('### PricingCard');
    expect(out).toContain('`my-card` 800x600');
  });

  it('writes to a file with --out', async () => {
    const { code } = await capture(() =>
      runSchema(['--out', 'spec.schema.json'], { cwd: dir }),
    );
    expect(code).toBe(0);
    const written = JSON.parse(await readFile(join(dir, 'spec.schema.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(written['title']).toBe('mediakit asset spec');
  });

  it('rejects an unknown --format', async () => {
    const { code } = await capture(() => runSchema(['--format', 'yaml'], { cwd: dir }));
    expect(code).toBe(1);
  });
});
