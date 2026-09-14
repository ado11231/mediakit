#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadProject } from './config.js';
import { buildCampaign, exportCampaign } from './export.js';
import { initializeProject, installBrowser } from './init.js';
import { previewProject } from './preview.js';
import { StatusLine, terminal } from './terminal.js';

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
      'mediakit <command> [options]\n\nCommands\n  init       Create a campaign (use --quick for one file)\n  check      Validate every slide and output\n  preview    Watch and preview rendered images\n  export     Write verified PNGs or a PDF\n\nOptions\n  --config <path>       Use a specific config\n  --port <number>       Set the preview port (default: 4310)\n  --install-browser     Install Chromium during init\n  --no-browser          Skip Chromium installation during init\n  --quick               Create a single-file setup during init\n  -h, --help            Show this help\n',
    );
    return;
  }
  if (positionals.length > 1)
    throw new Error('Unexpected arguments. Configure the campaign path in mediakit.config.ts.');
  if (command === 'init') {
    if (values['install-browser']) {
      terminal.info('Installing Chromium');
      await installBrowser();
    }
    terminal.info('Inspecting the project');
    const report = await initializeProject(
      process.cwd(),
      !values['no-browser'],
      values.quick,
      (message) => {
        terminal.info(message);
      },
    );
    process.stderr.write(`${terminal.success('✓')} Project ready\n`);
    process.stdout.write(report.map((line) => `  ${line}`).join('\n') + '\n');
    return;
  }
  if (values['install-browser'] || values['no-browser'] || values.quick)
    throw new Error('Setup flags are only supported by init.');
  if (command === 'preview') {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('--port must be an integer from 1 to 65535.');
    const status = new StatusLine('Starting preview');
    const server = await previewProject(process.cwd(), values.config, port).then(
      (value) => {
        status.succeed('Preview server started');
        return value;
      },
      (error: unknown) => {
        status.fail('Preview could not start');
        throw error;
      },
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing preview address.');
    terminal.info(`http://127.0.0.1:${address.port}`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        server.close();
      });
    return;
  }
  if (!['check', 'export'].includes(command))
    throw new Error(`Unknown command "${command}". Use init, check, preview, or export.`);
  const status = new StatusLine('Loading campaign');
  try {
    const project = await loadProject(process.cwd(), values.config);
    const build = await buildCampaign(project, (progress) => {
      status.update(
        `Rendering ${progress.output} · slide ${progress.slide}/${progress.slideCount} · output ${progress.outputIndex}/${progress.outputCount}`,
      );
    });
    if (build.errors.length) throw new Error(build.errors.join('\n'));
    if (command === 'export') {
      status.update('Writing verified files');
      const destination = await exportCampaign(project, build);
      status.succeed(
        `Exported ${project.campaign.slides.length} slide(s) across ${build.bundles.length} output(s)`,
      );
      process.stdout.write(`${destination}\n`);
    } else
      status.succeed(
        `Checked ${project.campaign.slides.length} slide(s) across ${build.bundles.length} output(s)`,
      );
  } catch (error) {
    status.fail(`${command === 'export' ? 'Export' : 'Check'} failed`);
    throw error;
  }
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${terminal.error('mediakit error')}\n${message}\n`);
  process.exitCode = 1;
});
