import { createHash } from 'node:crypto';
import { BUILTIN_BLOCKS, BUILTIN_FRAMES, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import { applyConfig, createDefaultRegistries, parseSpec, presetNames } from '@mediakit/core';
import { renderSpec } from '../dist/index.js';

const tokens = { color: { accent: '#2563EB' } };

const spec = parseSpec(
  {
    id: 'cross-platform',
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
      'github-social',
      'producthunt-gallery',
      'cws-screenshot',
      'cws-marquee',
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
  'cross-platform.spec.json',
);

const registries = applyConfig(createDefaultRegistries(), {
  tokens,
  blocks: BUILTIN_BLOCKS,
  layouts: BUILTIN_LAYOUTS,
  frames: BUILTIN_FRAMES,
});

const hashes = {};
for (const preset of presetNames(spec)) {
  const [frame] = await renderSpec({
    spec,
    registries,
    tokens,
    preset,
    file: 'cross-platform.spec.json',
  });
  hashes[preset] = createHash('sha256')
    .update(frame?.png ?? Buffer.alloc(0))
    .digest('hex');
}

console.log(JSON.stringify(hashes, null, 2));
