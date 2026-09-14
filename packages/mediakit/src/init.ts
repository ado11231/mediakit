import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import postcss from 'postcss';
import { chromium } from 'playwright';
import { fileExists } from './config.js';
import { quickConfig } from './quick.js';

const excluded = new Set([
  'node_modules',
  '.git',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.mediakit',
  'Pods',
  '.turbo',
]);
export interface DesignCandidate {
  path: string;
  type: 'css' | 'module' | 'font';
  tokens: string[];
}
export async function discoverDesign(root: string): Promise<DesignCandidate[]> {
  const results: DesignCandidate[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 6) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const displayPath = relative(root, path);
      if (/\.(ttf|otf|woff2?)$/i.test(entry.name))
        results.push({ path: displayPath, type: 'font', tokens: [] });
      else if (/\.css$/.test(entry.name)) {
        const tree = postcss.parse(await readFile(path, 'utf8'), { from: path });
        const tokens: string[] = [];
        tree.walkDecls((declaration) => {
          if (declaration.prop.startsWith('--')) tokens.push(declaration.prop);
        });
        if (tokens.length || /globals|theme|index/.test(entry.name))
          results.push({ path: displayPath, type: 'css', tokens: [...new Set(tokens)] });
      } else if (
        /^(?:theme|tokens|colors|typography|tailwind\.config)\.[cm]?[jt]s$/.test(entry.name)
      )
        results.push({ path: displayPath, type: 'module', tokens: [] });
    }
  }
  await visit(root, 0);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
export async function installBrowser(): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error('Chromium installation failed. Retry mediakit init --install-browser.'),
        );
    });
  });
}
export async function initializeProject(
  root: string,
  browser = true,
  quick = false,
): Promise<string[]> {
  if (quick) {
    for (const extension of ['ts', 'mts', 'js', 'mjs']) {
      if (await fileExists(join(root, `mediakit.config.${extension}`)))
        return ['Existing configuration preserved. Edit it, then run mediakit preview.'];
    }
    let esm = false;
    const packagePath = join(root, 'package.json');
    if (await fileExists(packagePath)) {
      const data: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
      esm = typeof data === 'object' && data !== null && Reflect.get(data, 'type') === 'module';
    }
    const name = `mediakit.config.${esm ? 'ts' : 'mts'}`;
    await mkdir(join(root, 'marketing', 'fonts'), { recursive: true });
    await mkdir(join(root, 'marketing', 'screens'), { recursive: true });
    await writeFile(join(root, name), quickConfig);
    if (browser && !(await fileExists(chromium.executablePath()))) await installBrowser();
    return [
      `Created ${name}. Copy, styling, positions, and destinations are all in this file.`,
      'Add your Brand-Regular.ttf and Brand-Bold.ttf files to marketing/fonts, or update the font paths.',
      'For screenshots, add marketing/screens/dashboard.png and uncomment the screen and screenshot slide.',
      'Edit the starter colors and copy, then run mediakit preview and mediakit export.',
    ];
  }
  const candidates = await discoverDesign(root);
  const report = candidates.map(
    (candidate) =>
      `${candidate.type}: ${candidate.path}${candidate.tokens.length ? ` (${candidate.tokens.join(', ')})` : ''}`,
  );
  const packagePath = join(root, 'package.json');
  if (await fileExists(packagePath)) {
    const packageData: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
    if (packageData && typeof packageData === 'object') {
      const dependencies: unknown = Reflect.get(packageData, 'dependencies');
      if (
        dependencies &&
        typeof dependencies === 'object' &&
        ('expo' in dependencies || 'react-native' in dependencies)
      ) {
        report.push(
          'Detected an Expo/React Native app. Use a separate fixture build for native capture.',
        );
        if (process.platform !== 'darwin')
          report.push('iOS capture requires macOS and Xcode. Image inputs still work here.');
        else {
          for (const tool of ['xcrun', 'maestro']) {
            const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
            const found = (
              await Promise.all(paths.map((path) => fileExists(join(path, tool))))
            ).some(Boolean);
            report.push(
              found
                ? `Found ${tool} on PATH.`
                : `Missing ${tool}: install it before using iOS capture.`,
            );
          }
          report.push(
            'Configure an installed simulator and fixture app. See marketing/fixtures/README.md.',
          );
        }
      }
    }
  }
  const existing = [];
  for (const extension of ['ts', 'mts', 'js', 'mjs'])
    if (await fileExists(join(root, `mediakit.config.${extension}`))) existing.push(extension);
  if (!existing.length) {
    const packageFile = join(root, 'package.json');
    let esm = false;
    if (await fileExists(packageFile)) {
      const data: unknown = JSON.parse(await readFile(packageFile, 'utf8'));
      esm = typeof data === 'object' && data !== null && Reflect.get(data, 'type') === 'module';
    }
    const extension = esm ? 'ts' : 'mts';
    await mkdir(join(root, 'marketing', 'fixtures'), { recursive: true });
    const campaign = `marketing/campaign.${extension}`;
    if (!(await fileExists(join(root, campaign))))
      await writeFile(
        join(root, campaign),
        `import { defineCampaign } from 'mediakit';\n\nexport default defineCampaign({\n  id: 'launch',\n  outputs: ['instagram-portrait'],\n  slides: [\n    { layout: 'text-only', headline: 'Write your headline here', body: 'Write your message here.' },\n  ],\n});\n`,
      );
    await writeFile(
      join(root, `mediakit.config.${extension}`),
      `import { defineConfig } from 'mediakit';\n\nexport default defineConfig({\n  campaign: '${campaign}',\n  // Map discovered sources explicitly. See marketing/design-sources.json.\n  sources: {},\n  fonts: {},\n  // Required: background, text, padding, headline. Body copy also needs gap, secondaryText, and body.\n  design: {},\n});\n`,
    );
    const fixtureReadme = join(root, 'marketing/fixtures/README.md');
    if (!(await fileExists(fixtureReadme)))
      await writeFile(
        fixtureReadme,
        `# Fixture entry\n\nReuse your real screens with memory-only sample data here. Do not import your production\napp bootstrap, authentication, database clients, or analytics.\n\nImport readFixtureRequest, createFixtureState, and markFixtureReady from mediakit/fixtures\nfor a web entry. Read the capture URL, select the scene and fixture, then mark ready after\nfonts and images load. Register a local URL and optional server command in capture.\n\nFor Expo, use a separate fixture app identifier ending in .mediakit. Read the initial and\nincoming deep links, reset state for each request, and set fixtureReadyId(request) as the\nready view testID. Supply request.time and createFixtureRandom(request.seed) to your UI.\nDisable screen animations and use local assets. Never mount the production providers.\n\nSee the repository's examples/expo-fixtures for a complete entry and build configuration.\n`,
      );
    report.push(
      `Created mediakit.config.${extension} and ${campaign}. Design choices still need configuration.`,
    );
  } else report.push('Existing configuration preserved.');
  await mkdir(join(root, 'marketing'), { recursive: true });
  await writeFile(
    join(root, 'marketing/design-sources.json'),
    JSON.stringify(candidates, null, 2) + '\n',
  );
  if (browser && !(await fileExists(chromium.executablePath()))) {
    process.stdout.write('Installing Chromium for capture and composition.\n');
    await installBrowser();
  }
  report.push(
    'Next: map design sources, configure fonts and typography, then run mediakit check.',
  );
  return report;
}
