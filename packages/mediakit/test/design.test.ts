import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Browser } from 'playwright';
import { launchBrowser } from '../src/browser.js';
import { DesignResolver } from '../src/design.js';
import { campaignSchema, configSchema, outputSchema } from '../src/schema.js';
import { readDesignCss } from '../src/css.js';

let browser: Browser;
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mediakit-design-'));
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
});

describe('explicit design resolution', () => {
  it('resolves CSS imports, theme aliases, rem units, and live changes', async () => {
    await writeFile(
      join(directory, 'palette.css'),
      ':root { --base: #ffffff; font-size: 20px; } .dark { --base: #111111; }',
    );
    const path = join(directory, 'globals.css');
    await writeFile(
      path,
      '@import "./palette.css"; @theme { --background: var(--base); --size: 2rem; }',
    );
    const config = configSchema.parse({
      sources: { app: { type: 'css', path: 'globals.css', selector: '.dark' } },
    });
    const resolver = new DesignResolver(config, directory, browser);
    expect(
      await resolver.resolveToken(
        { source: 'app', token: '--background' },
        'background',
        'color',
      ),
    ).toBe('rgb(17, 17, 17)');
    expect(await resolver.number({ source: 'app', token: '--size' }, 'size', 1)).toBe(40);
    await writeFile(path, ':root { --background: #ff0000; }');
    expect(
      await resolver.resolveToken(
        { source: 'app', token: '--background' },
        'background',
        'color',
      ),
    ).toBe('rgb(255, 0, 0)');
    expect(resolver.files.has(join(directory, 'palette.css'))).toBe(true);
  });
  it('reports missing used roles together without inventing defaults', async () => {
    const slide = campaignSchema.parse({
      id: 'test',
      outputs: ['instagram-square'],
      slides: [{ layout: 'text-only', headline: 'Hello' }],
    }).slides[0]!;
    const resolver = new DesignResolver(configSchema.parse({}), directory, browser);
    await expect(
      resolver.resolve(slide, outputSchema.parse({ width: 1080, height: 1080 }), 'slide 1'),
    ).rejects.toThrow(/background[\s\S]*text[\s\S]*padding[\s\S]*headline.font/);
  });
  it('requires body design only when a slide contains body text', async () => {
    const config = configSchema.parse({
      fonts: {
        brand: [
          { path: resolve('../../examples/source-app/fonts/Geist-Bold.ttf'), weight: 700 },
        ],
      },
      design: {
        background: '#fff',
        text: '#111',
        padding: 40,
        headline: { font: 'brand', size: 48, weight: 700, lineHeight: 56 },
      },
    });
    const resolver = new DesignResolver(config, directory, browser);
    const slide = campaignSchema.parse({
      id: 'test',
      outputs: ['instagram-square'],
      slides: [{ layout: 'text-only', headline: 'Hello' }],
    }).slides[0]!;
    const result = await resolver.resolve(
      slide,
      outputSchema.parse({ width: 1080, height: 1080 }),
      'slide 1',
    );
    expect(result.body).toBeUndefined();
    expect(result.gap).toBe(0);
  });
  it('resolves gradient stops and validates typography for each text run', async () => {
    const config = configSchema.parse({
      fonts: {
        brand: [
          { path: resolve('../../examples/source-app/fonts/Geist-Regular.ttf'), weight: 400 },
          { path: resolve('../../examples/source-app/fonts/Geist-Bold.ttf'), weight: 700 },
        ],
      },
      design: {
        background: {
          type: 'linear-gradient',
          angle: 140,
          stops: [
            { color: '#f8f4eb', position: 0 },
            { color: '#d6eadf', position: 100 },
          ],
        },
        text: '#18201c',
        padding: 40,
        headline: { font: 'brand', size: 48, weight: 400, lineHeight: 56 },
      },
    });
    const slide = campaignSchema.parse({
      id: 'test',
      outputs: ['instagram-square'],
      slides: [
        {
          layout: 'text-only',
          headline: [
            { text: 'Clear ' },
            { text: 'plans', weight: 700, size: 56, color: '#315c4b' },
          ],
        },
      ],
    }).slides[0]!;
    const result = await new DesignResolver(config, directory, browser).resolve(
      slide,
      outputSchema.parse({ width: 1080, height: 1080 }),
      'slide 1',
    );
    expect(result.background).toBe('linear-gradient(140deg, #f8f4eb 0%, #d6eadf 100%)');
    expect(result.headlineRuns).toMatchObject([
      { text: 'Clear ', font: 'brand', weight: 400, size: 48, color: '#18201c' },
      { text: 'plans', font: 'brand', weight: 700, size: 56, color: '#315c4b' },
    ]);
  });
  it('rejects cyclic imports and unresolved tokens', async () => {
    await writeFile(join(directory, 'cycle.css'), '@import "./cycle.css";');
    await expect(readDesignCss(join(directory, 'cycle.css'))).rejects.toThrow('circular');
    const resolver = new DesignResolver(
      configSchema.parse({ sources: { app: { type: 'css', path: 'globals.css' } } }),
      directory,
      browser,
    );
    await expect(
      resolver.resolveToken({ source: 'app', token: '--missing' }, 'text', 'color'),
    ).rejects.toThrow('--missing');
  });
  it('resolves named module exports without color heuristics', async () => {
    await writeFile(
      join(directory, 'theme.ts'),
      'export const theme = { color: { champagne: "#dfc999" } };',
    );
    const resolver = new DesignResolver(
      configSchema.parse({
        sources: { app: { type: 'module', path: 'theme.ts', export: 'theme' } },
      }),
      directory,
      browser,
    );
    expect(
      await resolver.resolveToken({ source: 'app', token: 'color.champagne' }, 'text', 'color'),
    ).toBe('#dfc999');
    await expect(
      resolver.resolveToken({ source: 'app', token: 'color.missing' }, 'text', 'color'),
    ).rejects.toThrow('text');
  });
});
