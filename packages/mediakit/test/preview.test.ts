import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { previewProject } from '../src/preview.js';
import { loadProject } from '../src/config.js';
import { buildCampaign } from '../src/export.js';

it('serves export pixels and replaces stale previews with actionable diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mediakit-preview-'));
  const config = {
    campaign: 'campaign.mts',
    fonts: {
      brand: [{ path: resolve('../../examples/source-app/fonts/Geist-Bold.ttf'), weight: 700 }],
    },
    design: {
      background: '#fff',
      text: '#111',
      padding: 40,
      headline: { font: 'brand', size: 48, weight: 700, lineHeight: 60 },
    },
    outputs: { small: { width: 600, height: 800 } },
  };
  await writeFile(
    join(root, 'mediakit.config.mts'),
    `export default ${JSON.stringify(config)}`,
  );
  await writeFile(
    join(root, 'campaign.mts'),
    'export default {id:"test",outputs:["small"],slides:[{layout:"text-only",headline:"Preview matches export"}]}',
  );
  const server = await previewProject(root, undefined, 0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing preview address');
    const url = `http://127.0.0.1:${address.port}`;
    async function waitForRevision(minimum: number) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const revision = Number(await (await fetch(url + '/revision')).text());
        if (revision >= minimum) return revision;
        await delay(100);
      }
      throw new Error('Preview did not finish rebuilding');
    }
    await waitForRevision(1);
    const png = Buffer.from(await (await fetch(url + '/images/0/0.png')).arrayBuffer());
    const build = await buildCampaign(await loadProject(root));
    expect(build.errors).toEqual([]);
    expect(png).toEqual(build.bundles[0]!.slides[0]!.png);
    await writeFile(
      join(root, 'mediakit.config.mts'),
      'export default {campaign:"campaign.mts",outputs:{small:{width:600,height:800}}}',
    );
    await expect
      .poll(async () => (await fetch(url)).text(), { timeout: 10000 })
      .toContain('required design value is missing');
    expect((await fetch(url + '/images/0/0.png')).status).toBe(404);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await rm(root, { recursive: true, force: true });
  }
});
