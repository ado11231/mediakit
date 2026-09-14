import { watch } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { relative, resolve } from 'node:path';
import { loadProject } from './config.js';
import { buildCampaign, type CampaignBuild } from './export.js';
import { escapeHtml } from './composition.js';
import { terminal } from './terminal.js';

export async function previewProject(
  root: string,
  configPath: string | undefined,
  port: number,
): Promise<Server> {
  let build: CampaignBuild | undefined;
  let errors: string[] = [];
  let revision = 0;
  let running = false;
  let pending = false;
  let closed = false;
  async function rebuild(): Promise<void> {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    do {
      pending = false;
      try {
        const project = await loadProject(root, configPath);
        build = await buildCampaign(project);
        errors = build.errors;
      } catch (error) {
        build = undefined;
        errors = [error instanceof Error ? error.message : String(error)];
      }
      revision++;
      if (errors.length)
        process.stderr.write(
          `${terminal.error('✗')} Preview has ${errors.length} issue(s). Open it for details.\n`,
        );
      else process.stderr.write(`${terminal.success('✓')} Preview updated\n`);
      // Watch callbacks can schedule another build while the current one awaits capture.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } while (pending && !closed);
    running = false;
  }
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/revision') {
      response.end(String(revision));
      return;
    }
    const asset = /^\/images\/(\d+)\/(\d+)\.png$/.exec(pathname);
    if (asset) {
      const image = build?.bundles[Number(asset[1])]?.slides[Number(asset[2])]?.png;
      if (image) {
        response.setHeader('Content-Type', 'image/png');
        response.end(image);
      } else {
        response.statusCode = 404;
        response.end('No current image.');
      }
      return;
    }
    if (pathname !== '/') {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      `<!doctype html><html><head><title>Mediakit preview</title><style>body{font:16px system-ui;margin:32px;background:#eee;color:#171717}img{max-width:360px;height:auto;display:block;border:1px solid #ccc}.slides{display:flex;gap:20px;flex-wrap:wrap}pre{white-space:pre-wrap;color:#8b1a1a}a{color:inherit}</style></head><body><h1>Mediakit preview</h1><p>Click an image to inspect it at full resolution.</p>${!build && !errors.length ? '<p>Rendering...</p>' : ''}${errors.length ? `<h2>Incomplete outputs</h2><pre>${escapeHtml(errors.join('\n\n'))}</pre><p>Export is blocked until these issues are fixed.</p>` : ''}${build?.bundles.map((bundle, index) => `<h2>${escapeHtml(bundle.name)} (${bundle.output.width} × ${bundle.output.height})</h2><div class="slides">${bundle.slides.map((_, slide) => `<a href="/images/${index}/${slide}.png"><img src="/images/${index}/${slide}.png" alt="Slide ${slide + 1}"></a>`).join('')}</div>`).join('') ?? ''}<script>const revision=${revision};setInterval(async()=>{try{if(Number(await(await fetch('/revision')).text())!==revision)location.reload()}catch{}},1000)</script></body></html>`,
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (!file) return;
    const path = relative(root, resolve(root, file));
    if (
      path
        .split(/[\\/]/)
        .some(
          (part) =>
            [
              'node_modules',
              '.git',
              '.expo',
              '.next',
              'dist',
              'build',
              '.mediakit',
              'export',
            ].includes(part) || part.startsWith('.mediakit-'),
        )
    )
      return;
    void rebuild();
  });
  server.on('close', () => {
    closed = true;
    watcher.close();
  });
  void rebuild();
  return server;
}
