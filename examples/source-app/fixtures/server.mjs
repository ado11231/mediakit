import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const assets = new Map([
  ['/globals.css', [resolve(root, 'app/globals.css'), 'text/css']],
  ['/dashboard.mjs', [resolve(root, 'app/dashboard.mjs'), 'text/javascript']],
  ['/data.mjs', [resolve(root, 'fixtures/data.mjs'), 'text/javascript']],
  ['/mediakit-fixtures.js', [require.resolve('mediakit/fixtures'), 'text/javascript']],
  ['/fonts/Geist-Regular.ttf', [resolve(root, 'fonts/Geist-Regular.ttf'), 'font/ttf']],
  ['/fonts/Geist-Bold.ttf', [resolve(root, 'fonts/Geist-Bold.ttf'), 'font/ttf']],
]);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const asset = assets.get(url.pathname);
    if (asset) {
      response.setHeader('Content-Type', asset[1]);
      response.end(await readFile(asset[0]));
      return;
    }
    if (url.pathname !== '/') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><link rel="stylesheet" href="/globals.css"></head><body><script type="module">
import { renderDashboard } from '/dashboard.mjs';
import { fixtures } from '/data.mjs';
import { readFixtureRequest, createFixtureState, markFixtureReady } from '/mediakit-fixtures.js';
const request = readFixtureRequest(location.href);
if (request.scene !== 'dashboard') throw new Error('Unknown scene ' + request.scene);
document.body.innerHTML = renderDashboard(createFixtureState(fixtures, request));
await document.fonts.ready;
markFixtureReady(request);
</script></body></html>`);
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
server.listen(Number(process.env.PORT ?? 4311), '127.0.0.1');
