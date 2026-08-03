import { createHash } from 'node:crypto';
import { BUILTIN_BLOCKS, BUILTIN_LAYOUTS } from '@mediakit/blocks/defaults';
import { applyConfig, createDefaultRegistries, parseSpec } from '@mediakit/core';
import { renderSpec } from '../dist/index.js';

/**
 * Run as a separate process by `determinism.test.ts`. Rendering twice inside one process
 * shares satori's font cache and cannot tell "deterministic" from "cached", which is the
 * exact gap the M0 spike's own harness had.
 */

export const SPEC = {
  id: 'determinism-fixture',
  preset: 'ig-portrait',
  frames: [
    {
      layout: 'split',
      blocks: [
        { type: 'Eyebrow', props: { text: 'Assets as code' }, slot: 'left' },
        {
          // `title` rather than the default `display`: a half-width column cannot fit a
          // word set at display size, and choosing the token is the author's job.
          type: 'Headline',
          props: { text: 'Every screenshot, rebuilt on commit', size: 'title' },
          slot: 'left',
        },
        {
          type: 'BulletList',
          props: { items: ['Deterministic, byte for byte', 'Runs anywhere CI runs'] },
          slot: 'right',
        },
      ],
    },
    {
      layout: 'centered',
      background: 'surface',
      blocks: [
        { type: 'Headline', props: { text: 'A second, different frame', align: 'center' } },
        { type: 'Body', props: { text: 'It must not render as frame one.', align: 'center' } },
      ],
    },
  ],
};

export const render = async () => {
  const registries = applyConfig(createDefaultRegistries(), {
    tokens: { color: { accent: '#2563EB' } },
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
  });

  return renderSpec({
    spec: parseSpec(SPEC, 'determinism-fixture.spec.json'),
    registries,
    tokens: { color: { accent: '#2563EB' } },
    preset: 'ig-portrait',
    file: 'determinism-fixture.spec.json',
  });
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const frames = await render();
  for (const frame of frames) {
    console.log(`${frame.index} ${createHash('sha256').update(frame.png).digest('hex')}`);
  }
}
