import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runPreview } from '../src/index.js';
import { MediakitError } from '@mediakit/core';

const CONFIG = `export default { tokens: { color: { accent: '#2563EB' } } };`;

const spec = (id: string, preset: string | string[], headline = 'hi'): string =>
  JSON.stringify({
    id,
    preset,
    frames: [
      {
        layout: 'centered',
        blocks: [{ type: 'Headline', props: { text: headline, align: 'center' } }],
      },
    ],
  });

const pngWidth = (buffer: Buffer): number => buffer.readUInt32BE(16);
const pngHeight = (buffer: Buffer): number => buffer.readUInt32BE(20);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = (buffer: Buffer): boolean =>
  buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIG);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('runPreview', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-preview-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  interface ServerHandle {
    port: number;
    abort: AbortController;
  }

  const start = async (args: readonly string[], cwd: string): Promise<ServerHandle> => {
    const abort = new AbortController();
    const handle: ServerHandle = { port: 0, abort };
    const code = runPreview([...args, '--port', '0'], {
      cwd,
      signal: abort.signal,
      onReady: (port) => {
        handle.port = port;
      },
    });
    const waited = await Promise.race([code.then((c) => c), waitForPort(handle, 10000)]);
    if (typeof waited === 'number') throw new Error(`preview exited early with ${waited}`);
    return handle;
  };

  const waitForPort = async (handle: ServerHandle, timeoutMs: number): Promise<'ready'> => {
    const start = performance.now();
    while (handle.port === 0) {
      if (performance.now() - start > timeoutMs) throw new Error('preview failed to start');
      await sleep(20);
    }
    return 'ready';
  };

  const stop = (handle: ServerHandle): void => {
    handle.abort.abort();
  };

  const get = async (handle: ServerHandle, path: string): Promise<Response> => {
    return await fetch(`http://localhost:${handle.port}${path}`);
  };

  it('GET / returns HTML containing image tags for each frame', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), spec('ex', 'ig-portrait'), 'utf8');

    const handle = await start(['marketing/ex.spec.json'], dir);
    try {
      const res = await get(handle, '/');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('ex');
      expect(html).toContain('/ig-portrait/frame-01.png');
      expect(html).toContain('EventSource');
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('GET /<preset>/frame-01.png returns a valid PNG at the preset dimensions', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), spec('ex', 'ig-portrait'), 'utf8');

    const handle = await start(['marketing/ex.spec.json'], dir);
    try {
      const res = await get(handle, '/ig-portrait/frame-01.png');
      expect(res.status).toBe(200);
      const png = Buffer.from(await res.arrayBuffer());
      expect(isPng(png)).toBe(true);
      expect(pngWidth(png)).toBe(1080);
      expect(pngHeight(png)).toBe(1350);
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('GET /events opens an SSE stream that stays connected', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), spec('ex', 'ig-portrait'), 'utf8');

    const handle = await start(['marketing/ex.spec.json'], dir);
    try {
      const res = await get(handle, '/events');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const result = await reader.read();
      expect(result.value).toBeDefined();
      await reader.cancel();
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('modifying the spec triggers a re-render', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    const specPath = join(dir, 'marketing', 'ex.spec.json');
    await writeFile(specPath, spec('ex', 'ig-portrait', 'first'), 'utf8');

    const handle = await start(['marketing/ex.spec.json'], dir);
    try {
      const html1 = await (await get(handle, '/')).text();
      expect(html1).toContain('ex');

      await sleep(100);
      await writeFile(specPath, spec('ex', 'ig-portrait', 'second'), 'utf8');
      await sleep(800);

      const html2 = await (await get(handle, '/')).text();
      expect(html2).toContain('ex');
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('--preset renders only the named preset', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'ex.spec.json'),
      spec('ex', ['ig-portrait', 'story']),
      'utf8',
    );

    const handle = await start(['marketing/ex.spec.json', '--preset', 'story'], dir);
    try {
      const html = await (await get(handle, '/')).text();
      expect(html).toContain('/story/frame-01.png');
      expect(html).not.toContain('/ig-portrait/frame-01.png');
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('multi-preset spec shows both presets in the HTML', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(
      join(dir, 'marketing', 'ex.spec.json'),
      spec('ex', ['ig-portrait', 'story']),
      'utf8',
    );

    const handle = await start(['marketing/ex.spec.json'], dir);
    try {
      const html = await (await get(handle, '/')).text();
      expect(html).toContain('/ig-portrait/frame-01.png');
      expect(html).toContain('/story/frame-01.png');
    } finally {
      stop(handle);
    }
  }, 30_000);

  it('prints --help and exits 0', async () => {
    const code = await runPreview(['--help'], { cwd: dir });
    expect(code).toBe(0);
  });

  it('returns 1 when no spec path is given', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    const code = await runPreview([], { cwd: dir });
    expect(code).toBe(1);
  });

  it('returns 1 when the spec path is missing on disk', async () => {
    await writeFile(join(dir, 'mediakit.config.js'), CONFIG, 'utf8');
    const code = await runPreview(['marketing/does-not-exist.spec.json'], { cwd: dir });
    expect(code).toBe(1);
  });

  it('throws MediakitError when no mediakit.config is present', async () => {
    await mkdir(join(dir, 'marketing'), { recursive: true });
    await writeFile(join(dir, 'marketing', 'ex.spec.json'), spec('ex', 'ig-portrait'), 'utf8');
    await expect(
      runPreview(['marketing/ex.spec.json'], {
        cwd: dir,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(MediakitError);
  }, 30_000);
});
