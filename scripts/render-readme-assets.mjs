import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Discovery strategy 1: the repo renders its own README. The images the README shows are not
 * hand-placed screenshots, they are committed artifacts of the source app's specs and tokens.
 * This regenerates them in place from the committed specs and fails if the result differs from
 * what git has, so an edit to a spec that was not re-rendered cannot ship a stale README image.
 *
 * Byte-level determinism is proven separately by the example test, which renders to a temp dir
 * and hashes against the committed files. This script's job is narrower and complementary: keep
 * the specific PNGs the README embeds current, with a single command to regenerate them.
 *
 * Order matters. The store spec frames a rendered app screen (its DeviceFrame src is
 * marketing/app-screen/frame-01.png), so app-screen must render before store. launch is
 * independent. Rendering uses the source app's own installed bin so the custom block, layout,
 * and preset registered in its mediakit.config.ts are in scope.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const app = join(root, 'examples', 'source-app');
const bin = join(app, 'node_modules', '.bin', 'mediakit');

const SPECS = [
  'marketing/app-screen.spec.json',
  'marketing/store.spec.json',
  'marketing/launch.spec.json',
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

try {
  for (const spec of SPECS) {
    run(bin, ['render', spec], app);
  }

  const drift = run(
    'git',
    ['status', '--porcelain', '--', 'examples/source-app/marketing'],
    root,
  ).trim();

  if (drift !== '') {
    console.error(
      [
        'render-readme-assets: the committed README assets drifted from their specs.',
        'The renderer produced different bytes than what is committed, so re-run this script',
        'and commit the regenerated PNGs under examples/source-app/marketing:',
        '',
        drift,
      ].join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log('render-readme-assets: ok');
    console.log(`  regenerated in place from ${SPECS.length} committed specs, no drift`);
  }
} catch (error) {
  const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
  console.error(`render-readme-assets failed:\n${detail}`);
  process.exitCode = 1;
}
