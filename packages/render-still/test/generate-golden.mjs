import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BUILTIN_BLOCKS, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import { applyConfig, createDefaultRegistries, parseSpec, presetNames } from '@mediakit/core';
import { renderSpec } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'golden');

const tokens = { color: { accent: '#2563EB' } };

const spec = parseSpec(
  {
    id: 'golden',
    preset: [
      'ig-portrait',
      'ig-square',
      'story',
      'li-portrait',
      'ios-6.9',
      'ios-6.5',
      'ipad-13',
      'play-phone',
      'play-feature',
    ],
    frames: [
      {
        layout: 'centered',
        blocks: [
          { type: 'Eyebrow', props: { text: 'Golden', align: 'center' } },
          { type: 'Headline', props: { text: 'Determinism', align: 'center' } },
          {
            type: 'Body',
            props: { text: 'Same spec, same bytes, every run.', align: 'center' },
          },
        ],
      },
    ],
  },
  'golden.spec.json',
);

const registries = applyConfig(createDefaultRegistries(), {
  tokens,
  blocks: BUILTIN_BLOCKS,
  layouts: BUILTIN_LAYOUTS,
});

await mkdir(out, { recursive: true });
for (const preset of presetNames(spec)) {
  const [frame] = await renderSpec({
    spec,
    registries,
    tokens,
    preset,
    file: 'golden.spec.json',
  });
  const path = join(out, `${preset}.png`);
  await writeFile(path, frame?.png ?? Buffer.alloc(0));
  console.log(`wrote ${preset}.png`);
}
