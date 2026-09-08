import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Browser } from 'playwright';
import { launchBrowser } from '../src/browser.js';
import { CaptureSession, createIosFlow } from '../src/capture.js';
import { configSchema } from '../src/schema.js';
import { captureEnvironment } from '../src/process.js';
import { createFixtureState, readFixtureRequest } from '../src/fixtures.js';

let browser: Browser;
let server: Server;
let url: string;
let databaseRequests = 0;
beforeAll(async () => {
  browser = await launchBrowser();
  server = createServer((request, response) => {
    if (request.url?.startsWith('/api')) {
      databaseRequests++;
      response.end('{}');
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(
      `<html><body style="background:#eee"><h1>Real screen</h1><script>const q=new URL(location.href).searchParams;${request.url?.startsWith('/unsafe') ? "fetch('/api/database').catch(()=>{});" : ''}document.documentElement.dataset.mediakitReady='mediakit-ready-'+q.get('scene')+'-'+q.get('fixture');</script></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});
it('captures local UI at device resolution without reaching a database', async () => {
  const config = configSchema.parse({
    capture: { web: { type: 'web', url } },
    screens: {
      dashboard: {
        type: 'web',
        target: 'web',
        scene: 'dashboard',
        width: 300,
        height: 600,
        scale: 2,
      },
    },
  });
  const session = new CaptureSession(config, process.cwd(), browser);
  try {
    expect(await session.get('dashboard')).toMatchObject({ width: 600, height: 1200 });
    expect(databaseRequests).toBe(0);
  } finally {
    session.close();
  }
});
it('fails capture when a fixture tries to access an API', async () => {
  const config = configSchema.parse({
    capture: { web: { type: 'web', url: url + '/unsafe' } },
    screens: {
      dashboard: { type: 'web', target: 'web', scene: 'dashboard', width: 300, height: 600 },
    },
  });
  const session = new CaptureSession(config, process.cwd(), browser);
  try {
    await expect(session.get('dashboard')).rejects.toThrow('unexpected requests');
    expect(databaseRequests).toBe(0);
  } finally {
    session.close();
  }
});
it('requires native readiness and quotes deep links and paths safely', () => {
  const flow = createIosFlow('example.mediakit', 'mediakit-ready-home-default', 'screen', 5000);
  expect(flow).toContain('id: "mediakit-ready-home-default"');
  expect(flow).toContain('takeScreenshot: "screen"');
});
it('does not inherit database secrets into capture commands', () => {
  process.env.MEDIAKIT_TEST_DATABASE_SECRET = 'secret';
  try {
    expect(captureEnvironment()).not.toHaveProperty('MEDIAKIT_TEST_DATABASE_SECRET');
  } finally {
    delete process.env.MEDIAKIT_TEST_DATABASE_SECRET;
  }
});
it('creates independent fixture state and validates launch parameters', () => {
  const request = readFixtureRequest(
    'app://capture?scene=home&fixture=default&time=2026-01-01T00:00:00Z&locale=en-US&timezone=UTC&theme=light&seed=1',
  );
  const fixtures = { default: { items: ['one'] } };
  const state = createFixtureState(fixtures, request);
  state.items.push('two');
  expect(fixtures.default.items).toEqual(['one']);
  expect(() => readFixtureRequest('app://capture')).toThrow('Incomplete');
});
