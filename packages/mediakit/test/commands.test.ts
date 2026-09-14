import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../src/init.js';
import { loadProject } from '../src/config.js';
import { configSchema } from '../src/schema.js';
import { resolveOutput } from '../src/presets.js';
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
it('scaffolds explicit requirements without overwriting user config or copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-init-'));
  directories.push(root);
  await writeFile(join(root, 'globals.css'), ':root{--background:#fff;--foreground:#111}');
  const report = await initializeProject(root, false);
  expect(report.join('\n')).toContain('--background');
  const config = await readFile(join(root, 'mediakit.config.mts'), 'utf8');
  expect(config).toContain('design: {}');
  expect(config).not.toContain('#fff');
  await writeFile(join(root, 'mediakit.config.mts'), 'user configuration');
  await writeFile(join(root, 'marketing/campaign.mts'), 'user copy');
  await initializeProject(root, false);
  expect(await readFile(join(root, 'mediakit.config.mts'), 'utf8')).toBe('user configuration');
  expect(await readFile(join(root, 'marketing/campaign.mts'), 'utf8')).toBe('user copy');
});
it('reloads imported campaign modules after edits and rejects multiple configs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-config-'));
  directories.push(root);
  await writeFile(join(root, 'copy.ts'), 'export const headline = "First";');
  await writeFile(
    join(root, 'campaign.ts'),
    'import { headline } from "./copy.ts"; export default {id:"test",outputs:["instagram-square"],slides:[{layout:"text-only",headline}]};',
  );
  await writeFile(join(root, 'mediakit.config.ts'), 'export default {campaign:"campaign.ts"};');
  expect((await loadProject(root)).campaign.slides[0]!.headline).toBe('First');
  await writeFile(join(root, 'copy.ts'), 'export const headline = "Second";');
  expect((await loadProject(root)).campaign.slides[0]!.headline).toBe('Second');
  await writeFile(join(root, 'mediakit.config.mts'), 'export default {};');
  await expect(loadProject(root)).rejects.toThrow('Multiple config');
});
it('allows preset typography overrides without changing channel dimensions', () => {
  const config = configSchema.parse({
    outputs: { 'app-store-iphone': { design: { headline: { size: 96 } } } },
  });
  expect(resolveOutput('app-store-iphone', config)).toMatchObject({
    width: 1320,
    height: 2868,
    design: { headline: { size: 96 } },
  });
  config.outputs['app-store-iphone'] = { width: 500 };
  expect(() => resolveOutput('app-store-iphone', config)).toThrow('fixed');
});
it('allows an Expo project to initialize without requiring native capture tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-expo-init-'));
  directories.push(root);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ type: 'module', dependencies: { expo: '*' } }),
  );
  const report = await initializeProject(root, false);
  expect(report.join('\n')).toContain('Detected an Expo/React Native app');
  expect(await readFile(join(root, 'mediakit.config.ts'), 'utf8')).toContain('design: {}');
});

it('creates a single-file quick start and preserves existing user files on repeat runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-quick-'));
  directories.push(root);
  await initializeProject(root, false, true);
  const path = join(root, 'mediakit.config.mts');
  const source = await readFile(path, 'utf8');
  // Use the plain export in this temporary project, which has no package installation.
  await writeFile(
    path,
    source.replace(
      "import { defineConfig } from 'mediakit';",
      'const defineConfig = (value) => value;',
    ),
  );
  const project = await loadProject(root);
  expect(project.campaignPath).toBe(path);
  expect(project.campaign.slides[0]!.positions!.headline!.x).toBe(64);
  await expect(readFile(join(root, 'marketing/campaign.mts'))).rejects.toThrow();
  await writeFile(path, 'user configuration');
  await initializeProject(root, false, true);
  expect(await readFile(path, 'utf8')).toBe('user configuration');
});

it('reloads inline copy and validates its slide positions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-inline-'));
  directories.push(root);
  const path = join(root, 'mediakit.config.ts');
  const config = {
    campaign: {
      id: 'launch',
      outputs: ['instagram-square'],
      slides: [
        {
          layout: 'text-only',
          headline: 'First',
          positions: { headline: { x: 10, y: 20, width: 100, height: 200 } },
        },
      ],
    },
  };
  await writeFile(path, `export default ${JSON.stringify(config)}`);
  expect((await loadProject(root)).campaign.slides[0]!.headline).toBe('First');
  config.campaign.slides[0]!.headline = 'Second';
  await writeFile(path, `export default ${JSON.stringify(config)}`);
  expect((await loadProject(root)).campaign.slides[0]!.headline).toBe('Second');
  config.campaign.slides[0]!.positions.headline.width = -1;
  await writeFile(path, `export default ${JSON.stringify(config)}`);
  await expect(loadProject(root)).rejects.toThrow('campaign');
});
