import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadProject } from '../packages/mediakit/dist/config.js';
import { buildCampaign, exportCampaign } from '../packages/mediakit/dist/export.js';

const root = resolve(import.meta.dirname, '..');
const project = await loadProject(resolve(root, 'examples/source-app'));
const build = await buildCampaign(project);
const directory = await exportCampaign(project, build);
await mkdir(resolve(root, 'docs/assets'), { recursive: true });
await copyFile(
  resolve(directory, 'readme-card/01.png'),
  resolve(root, 'docs/assets/store-card.png'),
);
await copyFile(
  resolve(directory, 'readme-card/03.png'),
  resolve(root, 'docs/assets/carousel.png'),
);
console.log('README images generated from the example campaign.');
