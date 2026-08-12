import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

/**
 * Discovery strategy 1: the repo renders its own README. The images the README shows are not
 * hand-placed screenshots, they are committed artifacts of the source app's specs and tokens.
 * This regenerates them in place from the committed specs, writes downscaled copies into
 * `docs/assets/` (what the README actually embeds), and fails if either tree differs from
 * what git has, so a spec edit that was not re-rendered cannot ship a stale README image.
 *
 * Byte-level determinism is proven separately by the example test, which renders to a temp dir
 * and hashes against the committed files. This script's job is narrower and complementary: keep
 * the specific PNGs the README embeds current, with a single command to regenerate them.
 *
 * Order matters, because several specs consume another's output. A store spec frames a
 * rendered app screen through its DeviceFrame src, so both app-screen renders have to come
 * first. `store-pair` then composites those two store frames, so it runs last. Rendering uses
 * the source app's own installed bin so the custom block, layout, and preset registered in its
 * config are in scope.
 *
 * The light entries are what makes the README's hero a pair. `app-screen.spec.json` is rendered
 * twice, once per theme, and `--out` keeps the second from overwriting the first; the screen's
 * content therefore lives in exactly one file and cannot drift between themes. Only the framing
 * spec is duplicated, because a spec's DeviceFrame src is a literal path and cannot vary by
 * config. Launch is the same idea for the carousel: light stays at `marketing/launch/` (the
 * example test hashes those bytes) and dark writes under `marketing/dark/`.
 *
 * `docs/assets/` is a display copy, not a second source of truth. Pair is already 2x the README
 * width (1120px canvas, 560px display), so it is copied. The carousel ships as one animated GIF
 * per theme rather than three stills: GitHub strips scripts and interactivity from a README, so
 * a cycling GIF is the closest a repo page gets to a swipeable carousel. Frames are downscaled
 * to 560px (2x of the 280px display width) before encoding. gifenc is pure integer math with no
 * timestamps, so the GIF bytes stay deterministic and the drift check below applies to them too.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const app = join(root, 'examples', 'source-app');
const bin = join(app, 'node_modules', '.bin', 'mediakit');
const docsAssets = join(root, 'docs', 'assets');

const requireFromRenderStill = createRequire(
  join(root, 'packages', 'render-still', 'package.json'),
);
const { Resvg } = requireFromRenderStill('@resvg/resvg-js');

const LIGHT = 'configs/light.config.ts';
const CAROUSEL_WIDTH = 560;
const CAROUSEL_FRAME_MS = 1600;

const SPECS = [
  { spec: 'marketing/app-screen.spec.json' },
  { spec: 'marketing/app-screen.spec.json', config: LIGHT, out: 'marketing/light' },
  { spec: 'marketing/store.spec.json' },
  { spec: 'marketing/store-light.spec.json', config: LIGHT },
  { spec: 'marketing/launch.spec.json', config: LIGHT },
  { spec: 'marketing/launch.spec.json', out: 'marketing/dark' },
  { spec: 'marketing/store-pair.spec.json' },
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const downscaleRgba = (png, targetWidth) => {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const targetHeight = Math.round((height * targetWidth) / width);
  const href = `data:image/png;base64,${png.toString('base64')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}"><image href="${href}" width="${targetWidth}" height="${targetHeight}"/></svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: targetWidth } }).render();
};

const carouselGif = (framesDir) => {
  const gif = GIFEncoder();
  for (const n of ['01', '02', '03']) {
    const png = readFileSync(join(framesDir, `frame-${n}.png`));
    const image = downscaleRgba(png, CAROUSEL_WIDTH);
    const rgba = new Uint8Array(image.pixels);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, image.width, image.height, { palette, delay: CAROUSEL_FRAME_MS });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
};

const publishDocsAssets = () => {
  mkdirSync(docsAssets, { recursive: true });
  copyFileSync(
    join(app, 'marketing', 'store-pair', 'frame-01.png'),
    join(docsAssets, 'store-pair.png'),
  );

  writeFileSync(
    join(docsAssets, 'launch-light.gif'),
    carouselGif(join(app, 'marketing', 'launch')),
  );
  writeFileSync(
    join(docsAssets, 'launch-dark.gif'),
    carouselGif(join(app, 'marketing', 'dark', 'launch')),
  );
};

try {
  for (const { spec, config, out } of SPECS) {
    run(
      bin,
      ['render', spec, ...(config ? ['--config', config] : []), ...(out ? ['--out', out] : [])],
      app,
    );
  }

  publishDocsAssets();

  const drift = run(
    'git',
    ['status', '--porcelain', '--', 'examples/source-app/marketing', 'docs/assets'],
    root,
  ).trim();

  if (drift !== '') {
    console.error(
      [
        'render-readme-assets: the committed README assets drifted from their specs.',
        'The renderer produced different bytes than what is committed, so re-run this script',
        'and commit the regenerated PNGs under examples/source-app/marketing and docs/assets:',
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
