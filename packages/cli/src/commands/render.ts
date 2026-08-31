import process from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import {
  checkFrame,
  MediakitError,
  parseSpec,
  presetNames,
  type Registries,
  type Violation,
} from '@mediakit/core';
import { renderSpec } from '@mediakit/render-still';
import { importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, displayPath, outputDir } from '../workspace.js';
import { bad, dim, ok } from '../style.js';

const USAGE = `mediakit render <spec> [--preset <name>] [--out <dir>] [--config <path>]

Render a spec to PNG. Fans out across every preset the spec declares unless
--preset names one. Output nests under the preset name whenever the spec
declares more than one, or when --preset is absent and more than one is
produced.

Options:
  --preset <name>    render only this preset, which must be one the spec names
  --out <dir>        write under this directory instead of marketing/
  --config <path>    use this config instead of mediakit.config.ts in cwd
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
  const configFlag = findValue(argv, '--config');
  if (argv.includes('--config') && configFlag === undefined) {
    process.stderr.write('mediakit: --config requires a value.\n');
    return 1;
  }

  const cwd = deps.cwd ?? process.cwd();

  const configPath = resolveConfigPath(cwd, configFlag);
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

  let bytes = 0;
  let count = 0;
  const warnings: Violation[] = [];

  for (const preset of desired) {
    const entry = registries.presets.get(preset, { file: specRel });
    const frames = await renderSpec({
      spec,
      registries,
      tokens: config.tokens,
      preset,
      file: specRel,
    });

    for (const frame of frames) {
      // Overflow and contrast are the rules `check` cannot run: they need the geometry and the
      // resolved colours of a render, and `check` deliberately does not render. Reported here,
      // where the author is looking, and again by `export`, the last gate before an upload.
      warnings.push(
        ...checkFrame({
          svg: frame.svg,
          textBoxes: frame.textBoxes,
          width: entry.width,
          height: entry.height,
          preset,
          file: specRel,
          frameIndex: frame.index,
        }),
      );

      const dir = outputDir(outDir, spec, preset, allPresets);
      const file = join(dir, `frame-${pad(frame.index)}.png`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, frame.png);
      bytes += frame.png.length;
      count += 1;
      // The per-frame hash line stays: it is what makes a changed PNG reviewable in a pull
      // request. The summary below is what a person actually reads.
      process.stdout.write(
        `${ok('wrote')} ${displayPath(cwd, file)} ${dim(`(sha256:${hash(frame.png)}…)`)}\n`,
      );
    }
  }

  for (const warning of warnings) {
    process.stdout.write(`\n${bad('warning')} ${warning.preset}: ${warning.message}\n`);
  }

  const mb = (bytes / 1_000_000).toFixed(2);
  process.stdout.write(
    `\n${ok('✓')} ${count} frame(s) across ${desired.length} preset(s), ${mb} MB.\n` +
      `  ${dim(displayPath(cwd, outDir))}\n` +
      `  ${dim(`Next: \`mediakit check ${specArg}\`, then \`mediakit export ${specArg}\`.`)}\n`,
  );

  return 0;
};
