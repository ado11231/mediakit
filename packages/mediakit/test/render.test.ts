import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { configSchema, campaignSchema } from '../src/schema.js';
import { buildCampaign, exportCampaign, sha256 } from '../src/export.js';
import type { Project } from '../src/config.js';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mediakit-render-'));
  await writeFile(join(root, 'config.ts'), 'config');
  await writeFile(join(root, 'campaign.ts'), 'campaign');
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
function project(slides: unknown[], outputs: string[] = ['test']): Project {
  return {
    root,
    configPath: join(root, 'config.ts'),
    campaignPath: join(root, 'campaign.ts'),
    config: configSchema.parse({
      fonts: {
        brand: [
          { path: resolve('../../examples/source-app/fonts/Geist-Bold.ttf'), weight: 700 },
          { path: resolve('../../examples/source-app/fonts/Geist-Regular.ttf'), weight: 400 },
        ],
      },
      design: {
        background: '#ffffff',
        text: '#101010',
        secondaryText: '#333333',
        padding: 40,
        gap: 20,
        headline: { font: 'brand', size: 48, weight: 700, lineHeight: 56 },
        body: { font: 'brand', size: 24, weight: 400, lineHeight: 32 },
      },
      outputs: {
        test: { width: 600, height: 800 },
        document: { width: 600, height: 800, format: 'pdf' },
      },
    }),
    campaign: campaignSchema.parse({ id: 'launch', outputs, slides }),
  };
}
it('renders distinct slides reproducibly and exports exact RGB pixels', async () => {
  const input = project([
    { layout: 'text-only', headline: 'Make room for today.', body: 'One task at a time.' },
    { layout: 'text-only', headline: 'Build some momentum.' },
  ]);
  const first = await buildCampaign(input);
  const second = await buildCampaign(input);
  expect(first.errors).toEqual([]);
  expect(second.errors).toEqual([]);
  expect(sha256(first.bundles[0]!.slides[0]!.png)).toBe(
    sha256(second.bundles[0]!.slides[0]!.png),
  );
  expect(sha256(first.bundles[0]!.slides[0]!.png)).not.toBe(
    sha256(first.bundles[0]!.slides[1]!.png),
  );
  expect(JSON.stringify(first.manifest)).toContain('campaign.ts: test, slide 1');
  expect(JSON.stringify(first.manifest)).not.toContain(root);
  const directory = await exportCampaign(input, first);
  const exported = await readFile(join(directory, 'test/01.png'));
  expect(exported).toEqual(first.bundles[0]!.slides[0]!.png);
  expect(await sharp(exported).metadata()).toMatchObject({
    width: 600,
    height: 800,
    hasAlpha: false,
  });
});
it('keeps the previous export when text overflows or another output fails', async () => {
  const input = project([{ layout: 'text-only', headline: 'Short title' }]);
  await exportCampaign(input, await buildCampaign(input));
  const previous = await readFile(join(root, 'dist/marketing/test/01.png'));
  input.campaign.slides[0]!.headline = 'Unbreakable'.repeat(30);
  const failed = await buildCampaign(input);
  expect(failed.errors.join('\n')).toMatch(/headline.*(outside|overflows)/);
  await expect(exportCampaign(input, failed)).rejects.toThrow('Export aborted');
  expect(await readFile(join(root, 'dist/marketing/test/01.png'))).toEqual(previous);
});
it('keeps document text vector-based and preserves page order and dimensions', async () => {
  const input = project(
    [
      { layout: 'text-only', headline: 'First page' },
      { layout: 'text-only', headline: 'Second page' },
    ],
    ['document'],
  );
  const build = await buildCampaign(input);
  expect(build.errors).toEqual([]);
  const document = await PDFDocument.load(build.bundles[0]!.document!);
  expect(document.getPageCount()).toBe(2);
  expect(document.getPage(0).getSize()).toEqual({ width: 450, height: 600 });
  expect(document.getPage(0).node.Resources()?.toString()).toContain('/Font');
});
it('requires source resolution and keeps the phone within the canvas', async () => {
  await writeFile(
    join(root, 'screen.png'),
    await sharp({ create: { width: 600, height: 1200, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  const input = project([
    {
      layout: 'headline-above-device',
      headline: 'Your real screen',
      screen: 'dashboard',
      device: 'iphone',
    },
  ]);
  input.config.screens.dashboard = { type: 'image', path: 'screen.png' };
  expect((await buildCampaign(input)).errors).toEqual([]);
  await writeFile(
    join(root, 'screen.png'),
    await sharp({ create: { width: 60, height: 120, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  expect((await buildCampaign(input)).errors.join('\n')).toContain('upscaled');
});
it('does not replace unrelated folders or input folders', async () => {
  const input = project([{ layout: 'text-only', headline: 'Hello' }]);
  const build = await buildCampaign(input);
  await mkdir(join(root, 'unrelated'));
  await writeFile(join(root, 'unrelated/keep.txt'), 'keep');
  input.config.outDir = 'unrelated';
  await expect(exportCampaign(input, build)).rejects.toThrow('not owned');
  expect(await readFile(join(root, 'unrelated/keep.txt'), 'utf8')).toBe('keep');
  input.config.outDir = '.';
  await expect(exportCampaign(input, build)).rejects.toThrow('child directory');
});
it('rejects missing glyphs and font weights instead of substituting fonts', async () => {
  const input = project([{ layout: 'text-only', headline: 'Hello 世界' }]);
  expect((await buildCampaign(input)).errors.join('\n')).toContain('cannot draw');
  input.campaign.slides[0]!.headline = 'Hello';
  input.config.design.headline!.weight = 600;
  expect((await buildCampaign(input)).errors.join('\n')).toContain('weight 600');
});
it('applies output-specific typography and reports misspelled overrides', async () => {
  const input = project([
    {
      layout: 'text-only',
      headline: 'Hello',
      outputs: { test: { design: { headline: { size: 36, lineHeight: 42 } } } },
    },
  ]);
  const build = await buildCampaign(input);
  expect(build.errors).toEqual([]);
  expect(JSON.stringify(build.manifest)).toContain('headline.size');
  input.campaign.slides[0]!.outputs = { typo: {} };
  expect((await buildCampaign(input)).errors.join('\n')).toContain('Unused output override');
});
it('renders every built-in destination at its exact configured dimensions', async () => {
  const { presets } = await import('../src/presets.js');
  const input = project(
    [
      { layout: 'text-only', headline: 'First slide' },
      { layout: 'text-only', headline: 'Second slide' },
    ],
    Object.keys(presets),
  );
  const build = await buildCampaign(input);
  expect(build.errors).toEqual([]);
  expect(build.bundles).toHaveLength(Object.keys(presets).length);
  for (const bundle of build.bundles) {
    expect(bundle.slides).toHaveLength(2);
    expect(await sharp(bundle.slides[0]!.png).metadata()).toMatchObject({
      width: presets[bundle.name]!.width,
      height: presets[bundle.name]!.height,
      hasAlpha: false,
    });
  }
});
