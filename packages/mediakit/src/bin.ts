#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadProject } from './config.js';
import { buildCampaign, exportCampaign } from './export.js';
import { initializeProject, installBrowser } from './init.js';
import { previewProject } from './preview.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      port: { type: 'string', default: '4310' },
      help: { type: 'boolean', short: 'h' },
      'install-browser': { type: 'boolean' },
      'no-browser': { type: 'boolean' },
      quick: { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(
      'mediakit init | check | preview | export\n\ninit discovers design sources and scaffolds a campaign. Use init --quick for a single editable file.\ncheck validates design, captures, and every output.\npreview watches files and displays rendered PNGs and diagnostics.\nexport writes verified PNG folders or a multipage PDF.\n\nOptions: --config <path>, --port <number>, init --install-browser, init --no-browser, init --quick\n',
    );
    return;
  }
  if (positionals.length > 1)
    throw new Error('Unexpected arguments. Configure the campaign path in mediakit.config.ts.');
  if (command === 'init') {
    if (values['install-browser']) await installBrowser();
    process.stdout.write(
      (await initializeProject(process.cwd(), !values['no-browser'], values.quick)).join('\n') +
        '\n',
    );
    return;
  }
  if (values['install-browser'] || values['no-browser'] || values.quick)
    throw new Error('Setup flags are only supported by init.');
  if (command === 'preview') {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('--port must be an integer from 1 to 65535.');
    const server = await previewProject(process.cwd(), values.config, port);
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        server.close();
      });
    return;
  }
  if (!['check', 'export'].includes(command))
    throw new Error(`Unknown command "${command}". Use init, check, preview, or export.`);
  const project = await loadProject(process.cwd(), values.config);
  const build = await buildCampaign(project);
  if (build.errors.length) throw new Error(build.errors.join('\n'));
  if (command === 'export')
    process.stdout.write(
      `Exported ${build.bundles.length} output(s) to ${await exportCampaign(project, build)}\n`,
    );
  else
    process.stdout.write(
      `Checked ${project.campaign.slides.length} slide(s) across ${build.bundles.length} output(s).\n`,
    );
}
main().catch((error: unknown) => {
  process.stderr.write(`mediakit: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
