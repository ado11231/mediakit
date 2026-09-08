import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const repository = resolve(import.meta.dirname, '..');
const directory = await mkdtemp(join(tmpdir(), 'mediakit-package-'));
function run(command, args, cwd, expected = 0) {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    assert.equal(expected, 0, 'Command unexpectedly succeeded');
    return output;
  } catch (error) {
    if (expected !== 0 && error.status === expected) return String(error.stderr);
    throw new Error(`${command} ${args.join(' ')} failed:\n${error.stderr ?? error.message}`);
  }
}
try {
  run('pnpm', ['--filter', 'mediakit', 'pack', '--pack-destination', directory], repository);
  const archive = (await readdir(directory)).find((name) => name.endsWith('.tgz'));
  assert.ok(archive);
  for (const moduleType of ['module', 'commonjs']) {
    const consumer = join(directory, moduleType);
    await mkdir(consumer);
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify({ private: true, ...(moduleType === 'module' ? { type: 'module' } : {}) }),
    );
    run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--save-dev', join(directory, archive)],
      consumer,
    );
    const cli = join(consumer, 'node_modules/mediakit/dist/bin.js');
    assert.match(
      run(process.execPath, [cli, '--help'], consumer),
      /init.*check.*preview.*export/,
    );
    run(process.execPath, [cli, 'init', '--no-browser'], consumer);
    assert.match(run(process.execPath, [cli, 'check'], consumer, 1), /required.*missing/);
    await copyFile(
      join(repository, 'examples/source-app/fonts/Geist-Bold.ttf'),
      join(consumer, 'Brand.ttf'),
    );
    const extension = moduleType === 'module' ? 'ts' : 'mts';
    await writeFile(
      join(consumer, `mediakit.config.${extension}`),
      `import { defineConfig } from 'mediakit'; export default defineConfig({ campaign:'marketing/campaign.${extension}', fonts:{brand:[{path:'Brand.ttf',weight:700}]}, design:{background:'#fff',text:'#111',padding:40,headline:{font:'brand',size:48,weight:700,lineHeight:60}}, outputs:{small:{width:600,height:800}} });`,
    );
    await writeFile(
      join(consumer, `marketing/campaign.${extension}`),
      `import { defineCampaign } from 'mediakit'; export default defineCampaign({id:'test',outputs:['small'],slides:[{layout:'text-only',headline:'A real package install.'}]});`,
    );
    run(process.execPath, [cli, 'check'], consumer);
    run(process.execPath, [cli, 'export'], consumer);
    const first = await readFile(join(consumer, 'dist/marketing/small/01.png'));
    run(process.execPath, [cli, 'export'], consumer);
    assert.deepEqual(await readFile(join(consumer, 'dist/marketing/small/01.png')), first);
    assert.match(
      run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { fixtureReadyId } from 'mediakit/fixtures'; console.log(fixtureReadyId({scene:'home',fixture:'default'}))",
        ],
        consumer,
      ),
      /mediakit-ready-home-default/,
    );
    console.log(`Package smoke passed: ${moduleType}`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
