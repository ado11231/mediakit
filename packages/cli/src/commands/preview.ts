import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { watch, type FSWatcher } from 'node:fs';
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { resolve, relative } from 'node:path';
import {
  MediakitError,
  parseSpec,
  presetNames,
  type AssetSpec,
  type MediakitConfig,
} from '@mediakit/core';
import { renderSpec, type RenderedFrame } from '@mediakit/render-still';
import { importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries } from '../workspace.js';

const USAGE = `mediakit preview <spec> [--port <n>] [--preset <name>]

Start a local dev server that renders the spec in memory and serves PNGs over
HTTP. Re-renders on spec, config, or font file change. It does not drive a
browser; it serves files to yours, so the browser-free invariant is untouched.

Options:
  --port <n>       listen on this port (default: 3000)
  --preset <name>   render only this preset, which must be one the spec names
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

const pad = (n: number): string => String(n + 1).padStart(2, '0');

interface PreviewDeps {
  cwd?: string;
  signal?: AbortSignal;
  onReady?: (port: number) => void;
}

type FrameMap = Readonly<Record<string, readonly RenderedFrame[]>>;

interface PreviewState {
  spec: AssetSpec;
  frames: FrameMap;
  error: string | undefined;
}

const renderToMemory = async (
  spec: AssetSpec,
  config: MediakitConfig,
  presets: readonly string[],
  specRel: string,
): Promise<FrameMap> => {
  const registries = buildRegistries(config);
  const frames: Record<string, readonly RenderedFrame[]> = {};
  for (const preset of presets) {
    const rendered = await renderSpec({
      spec,
      registries,
      tokens: config.tokens,
      preset,
      file: specRel,
    });
    frames[preset] = rendered;
  }
  return frames;
};

const frameByPath = (
  frames: FrameMap,
  preset: string,
  index: number,
): RenderedFrame | undefined => {
  const list = frames[preset];
  return list?.find((f) => f.index === index);
};

// Spec ids and preset names are open strings from a file on disk, so they reach the page as
// untrusted text even though the server is local-only.
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlPage = (state: PreviewState): string => {
  const { spec, frames } = state;
  const sections = Object.entries(frames)
    .map(([preset, frameList]) => {
      const images = frameList
        .map(
          (f) =>
            `      <img src="/${encodeURIComponent(preset)}/frame-${pad(f.index)}.png" alt="frame ${f.index + 1}" style="max-width:100%;border:1px solid #1f2937;border-radius:8px" />`,
        )
        .join('\n');
      return `    <section>\n      <h2>${escapeHtml(preset)}</h2>\n${images}\n    </section>`;
    })
    .join('\n');

  const errorOverlay = state.error
    ? `    <div id="error" style="position:fixed;bottom:0;left:0;right:0;background:#F87171;color:#0B0E14;padding:12px 16px;font-family:monospace;font-size:13px;white-space:pre-wrap">${escapeHtml(state.error)}</div>\n`
    : `    <div id="error"></div>\n`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mediakit preview: ${escapeHtml(spec.id)}</title>
  <style>
    body { margin:0; background:#0B0E14; color:#F5F7FA; font-family:system-ui,sans-serif }
    main { max-width:1080px; margin:0 auto; padding:24px }
    h1 { font-size:1.25rem; margin:0 0 1rem }
    h2 { font-size:1rem; color:#9AA4B2; margin:1.5rem 0 0.75rem; text-transform:uppercase; letter-spacing:0.08em }
    section { display:flex; flex-direction:column; gap:12px }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(spec.id)}</h1>
${sections}
  </main>
${errorOverlay}  <script>
    const sse = new EventSource('/events');
    const errEl = document.getElementById('error');
    sse.addEventListener('reload', () => location.reload());
    // Not 'error': EventSource fires a native error event with no .data on any dropped
    // connection, so sharing the name paints "undefined" over the overlay on Ctrl-C.
    sse.addEventListener('render-error', (e) => { errEl.textContent = e.data; });
    sse.addEventListener('ok', () => { errEl.textContent = ''; });
  </script>
</body>
</html>`;
};

interface WatchTarget {
  path: string;
  watcher: FSWatcher;
}

const collectFontPaths = (config: MediakitConfig): string[] => {
  const paths: string[] = [];
  for (const source of [config.tokens.font?.display, config.tokens.font?.body]) {
    if (source === undefined) continue;
    for (const file of source.files) paths.push(file.path);
  }
  return paths;
};

const parseSpecFile = async (specAbs: string, specRel: string): Promise<AssetSpec> => {
  const raw = await readFile(specAbs, 'utf8');
  let specJson: unknown;
  try {
    specJson = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MediakitError(`Invalid JSON in ${specRel}: ${message}`);
  }
  return parseSpec(specJson, specRel);
};

export const runPreview = async (
  argv: readonly string[],
  deps: PreviewDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const cwd = deps.cwd ?? process.cwd();
  const positional = argv.filter((a) => !a.startsWith('-'));
  const specArg = positional[0];
  if (specArg === undefined) {
    process.stderr.write('mediakit: preview needs a spec path.\n');
    return 1;
  }

  const namedPreset = findValue(argv, '--preset');
  if (argv.includes('--preset') && namedPreset === undefined) {
    process.stderr.write('mediakit: --preset requires a value.\n');
    return 1;
  }
  const portArg = findValue(argv, '--port');
  if (argv.includes('--port') && portArg === undefined) {
    process.stderr.write('mediakit: --port requires a value.\n');
    return 1;
  }
  const port = portArg !== undefined ? Number(portArg) : 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`mediakit: --port "${portArg}" is not a valid port number.\n`);
    return 1;
  }

  const specAbs = resolve(cwd, specArg);
  if (!existsSync(specAbs)) {
    process.stderr.write(`mediakit: spec file not found: ${relative(cwd, specAbs)}\n`);
    return 1;
  }
  const specRel = relative(cwd, specAbs);

  const configPath = resolveConfigPath(cwd);
  const config = await importConfig(configPath);
  const spec = await parseSpecFile(specAbs, specRel);

  const allPresets = presetNames(spec);
  const desired = namedPreset !== undefined ? [namedPreset] : allPresets;
  const unknownPreset = desired.find((p) => !allPresets.includes(p));
  if (unknownPreset !== undefined) {
    process.stderr.write(
      `mediakit: --preset "${unknownPreset}" is not one of the spec's presets: ${allPresets.join(', ')}.\n`,
    );
    return 1;
  }

  let state: PreviewState = {
    spec,
    frames: await renderToMemory(spec, config, desired, specRel),
    error: undefined,
  };

  const sseClients = new Set<ServerResponse>();

  // Every line of the payload needs its own `data:` prefix. A raw newline terminates the
  // field, and mediakit's errors are deliberately multi-line ("Unknown preset ...\nRegistered
  // presets:\n  ..."), so the most common preview failure is exactly the one that would
  // arrive truncated.
  const notify = (event: string, data: string): void => {
    const body = data
      .split('\n')
      .map((line) => `data: ${line}\n`)
      .join('');
    for (const res of sseClients) {
      res.write(`event: ${event}\n${body}\n`);
    }
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage(state));
      return;
    }

    const match = /^\/([^/]+)\/frame-(\d+)\.png$/.exec(url.pathname);
    if (match !== null) {
      const preset = match[1];
      const frameStr = match[2];
      if (preset === undefined || frameStr === undefined) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const frameIdx = Number(frameStr) - 1;
      const frame = frameByPath(state.frames, preset, frameIdx);
      if (frame === undefined) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(frame.png);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const watchers: WatchTarget[] = [];

  const addWatcher = (path: string, onChange: () => void): void => {
    if (!existsSync(path)) return;
    if (watchers.some((w) => w.path === path)) return;
    const watcher = watch(path, () => {
      onChange();
    });
    watchers.push({ path, watcher });
  };

  let debounce: ReturnType<typeof setTimeout> | undefined;

  const scheduleRerender = (): void => {
    if (debounce !== undefined) clearTimeout(debounce);
    debounce = setTimeout(() => {
      void rerender();
    }, 100);
  };

  const rerender = async (): Promise<void> => {
    try {
      const newConfig = await importConfig(configPath, { bustCache: true });
      const newSpec = await parseSpecFile(specAbs, specRel);
      const newAllPresets = presetNames(newSpec);
      if (namedPreset !== undefined && !newAllPresets.includes(namedPreset)) {
        throw new MediakitError(
          `--preset "${namedPreset}" is not one of the spec's presets: ${newAllPresets.join(', ')}.`,
        );
      }
      const newDesired = namedPreset !== undefined ? [namedPreset] : newAllPresets;
      const newFrames = await renderToMemory(newSpec, newConfig, newDesired, specRel);
      state = { spec: newSpec, frames: newFrames, error: undefined };
      notify('reload', '{}');
      notify('ok', '');
      process.stderr.write(`mediakit: re-rendered\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = { ...state, error: message };
      notify('render-error', message);
      process.stderr.write(`mediakit: ${message}\n`);
    }
    updateWatchers();
  };

  const updateWatchers = (): void => {
    for (const w of watchers) w.watcher.close();
    watchers.length = 0;
    addWatcher(specAbs, scheduleRerender);
    addWatcher(configPath, scheduleRerender);
    importConfig(configPath, { bustCache: true })
      .then((c) => {
        for (const path of collectFontPaths(c)) addWatcher(path, scheduleRerender);
      })
      .catch(() => {});
  };

  updateWatchers();

  server.listen(port, () => {
    const actual = server.address();
    const actualPort = typeof actual === 'object' && actual !== null ? actual.port : port;
    process.stdout.write(`mediakit: preview at http://localhost:${actualPort}\n`);
    deps.onReady?.(actualPort);
  });

  if (deps.signal !== undefined) await waitForSignal(deps.signal);
  else await waitForSignal(processSignal());

  server.close();
  for (const w of watchers) w.watcher.close();
  return 0;
};

const waitForSignal = (signal: AbortSignal): Promise<void> =>
  new Promise((resolvePromise) => {
    if (signal.aborted) resolvePromise();
    else
      signal.addEventListener(
        'abort',
        () => {
          resolvePromise();
        },
        { once: true },
      );
  });

const processSignal = (): AbortSignal => {
  const controller = new AbortController();
  const handler = (): void => {
    controller.abort();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return controller.signal;
};
