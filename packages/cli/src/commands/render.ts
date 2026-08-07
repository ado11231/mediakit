import process from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { MediakitError, parseSpec, presetNames, type Registries } from '@mediakit/core';
import { renderSpec } from '@mediakit/render-still';
import { importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, outputDir } from '../workspace.js';

const USAGE = `mediakit render <spec> [--preset <name>] [--out <dir>]

Render a spec to PNG. Fans out across every preset the spec declares unless
--preset names one. Output nests under the preset name whenever the spec
declares more than one, or when --preset is absent and more than one is
produced.

Options:
  --preset <name>   render only this preset, which must be one the spec names
  --out <dir>        write under this directory instead of marketing/
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const idx = argv.indexOf(flag);
  return idx === -1 ? undefined : argv[idx + 1];
};

interface RenderDeps {
  /** Test seam: override process.cwd() without calling process.chdir. */
  cwd?: string;
}

export const runRender = async (
  argv: readonly string[],
  deps: RenderDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const positional = argv.filter((a) => !a.startsWith('-'));
  const specArg = positional[0];
  if (specArg === undefined) {
    process.stderr.write('mediakit: render needs a spec path.\n');
    return 1;
  }

  const namedPreset = findValue(argv, '--preset');
  if (argv.includes('--preset') && namedPreset === undefined) {
    process.stderr.write('mediakit: --preset requires a value.\n');
    return 1;
  }
  const outFlag = findValue(argv, '--out');
  if (argv.includes('--out') && outFlag === undefined) {
    process.stderr.write('mediakit: --out requires a value.\n');
    return 1;
  }

  const cwd = deps.cwd ?? process.cwd();

  const configPath = resolveConfigPath(cwd);
  const config = await importConfig(configPath);

  const specAbs = resolve(cwd, specArg);
  if (!existsSync(specAbs)) {
    process.stderr.write(`mediakit: spec file not found: ${relative(cwd, specAbs)}\n`);
    return 1;
  }
  const specRel = relative(cwd, specAbs);
  const raw = await readFile(specAbs, 'utf8');
  let specJson: unknown;
  try {
    specJson = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MediakitError(`Invalid JSON in ${specRel}: ${message}`);
  }
  const spec = parseSpec(specJson, specRel);

  const allPresets = presetNames(spec);
  const desired = namedPreset !== undefined ? [namedPreset] : allPresets;
  const unknownPreset = desired.find((p) => !allPresets.includes(p));
  if (unknownPreset !== undefined) {
    process.stderr.write(
      `mediakit: --preset "${unknownPreset}" is not one of the spec's presets: ${allPresets.join(', ')}.\n`,
    );
    return 1;
  }

  const registries: Registries = buildRegistries(config);

  const outDir = resolve(cwd, outFlag ?? config.outDir ?? 'marketing');
  const pad = (n: number): string => String(n + 1).padStart(2, '0');
  const hash = (buffer: Buffer): string =>
    createHash('sha256').update(buffer).digest('hex').slice(0, 16);

  for (const preset of desired) {
    const frames = await renderSpec({
      spec,
      registries,
      tokens: config.tokens,
      preset,
      file: specRel,
    });

    for (const frame of frames) {
      const dir = outputDir(outDir, spec, preset, allPresets);
      const file = join(dir, `frame-${pad(frame.index)}.png`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, frame.png);
      process.stdout.write(`wrote ${relative(cwd, file)} (sha256:${hash(frame.png)}…)\n`);
    }
  }

  return 0;
};
