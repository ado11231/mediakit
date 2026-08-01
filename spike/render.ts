import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { SplitFrame, CANVAS } from './split.ts';
import { font } from './palette.ts';

const here = dirname(fileURLToPath(import.meta.url));

const weights = [
  { file: 'Geist-Regular.ttf', weight: 400 },
  { file: 'Geist-Medium.ttf', weight: 500 },
  { file: 'Geist-SemiBold.ttf', weight: 600 },
  { file: 'Geist-Bold.ttf', weight: 700 },
] as const;

const loadFonts = async () =>
  Promise.all(
    weights.map(async ({ file, weight }) => ({
      name: font.body,
      data: await readFile(join(here, 'fonts', file)),
      weight: weight as 400 | 500 | 600 | 700,
      style: 'normal' as const,
    })),
  );

const renderOnce = async (fonts: Awaited<ReturnType<typeof loadFonts>>) => {
  const svg = await satori(SplitFrame() as never, {
    width: CANVAS.width,
    height: CANVAS.height,
    fonts,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: CANVAS.width },
    // Apple rejects screenshots with an alpha channel (design.md:529). The spike
    // renders on an opaque background for the same reason.
    background: '#0B0E14',
  })
    .render()
    .asPng();

  return { svg, png };
};

const sha = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

const fonts = await loadFonts();

const first = await renderOnce(fonts);
const second = await renderOnce(fonts);

const out = join(here, 'out', 'split-device.png');
await writeFile(out, first.png);

const identical = sha(first.png) === sha(second.png);

console.log(`svg bytes   ${first.svg.length}`);
console.log(`png bytes   ${first.png.length}`);
console.log(`run 1 sha   ${sha(first.png)}`);
console.log(`run 2 sha   ${sha(second.png)}`);
console.log(`determinism ${identical ? 'PASS, byte identical' : 'FAIL, runs differ'}`);
console.log(`wrote       ${out}`);

if (!identical) process.exitCode = 1;
