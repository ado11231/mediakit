import process from 'node:process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import {
  checkAsset,
  checkSpec,
  MediakitError,
  parseSpec,
  presetNames,
  type MediakitConfig,
  type Violation,
} from '@mediakit/core';
import { importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, outputDir } from '../workspace.js';

const USAGE = `mediakit check <spec>                   validate a spec's brand rules and per-preset frame counts
mediakit check <file|dir> --preset <name>  validate rendered PNGs against a preset's rules

Options:
  --preset <name>   asset mode: check PNGs against this preset, no spec needed
  --out <dir>       where rendered output lives (default: marketing)
  -h, --help

check reports every violation together and exits non-zero if any. It is the cheapest on-ramp:
the asset mode works against hand-made screenshots with no renderer adopted.
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

interface CheckDeps {
  cwd?: string;
}

const report = (violations: readonly Violation[]): void => {
  for (const v of violations) {
    const where = [v.preset, v.file].filter(Boolean).join(' ');
    process.stdout.write(`${where ? `${where}: ` : ''}${v.message}\n`);
  }
};

const listPngs = async (path: string): Promise<string[]> => {
  const s = await stat(path);
  if (s.isFile()) return [path];
  const entries = await readdir(path);
  return entries
    .filter((name) => extname(name).toLowerCase() === '.png')
    .map((name) => join(path, name))
    .sort();
};

export const runCheck = async (
  argv: readonly string[],
  deps: CheckDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const cwd = deps.cwd ?? process.cwd();
  const positional = argv.filter((a) => !a.startsWith('-'));
  const target = positional[0];
  if (target === undefined) {
    process.stderr.write('mediakit: check needs a spec path, or a file/dir with --preset.\n');
    return 1;
  }

  const namedPreset = findValue(argv, '--preset');
  if (argv.includes('--preset')) {
    if (namedPreset === undefined) {
      process.stderr.write('mediakit: --preset requires a value.\n');
      return 1;
    }
    return runAssetCheck(resolve(cwd, target), namedPreset, cwd);
  }

  return runSpecCheck(resolve(cwd, target), findValue(argv, '--out'), cwd);
};

const runAssetCheck = async (
  path: string,
  presetName: string,
  cwd: string,
): Promise<number> => {
  if (!existsSync(path)) {
    process.stderr.write(`mediakit: path not found: ${relative(cwd, path)}\n`);
    return 1;
  }

  let config: MediakitConfig;
  try {
    config = await importConfig(resolveConfigPath(cwd));
  } catch {
    // Asset mode with a built-in preset works without a config; a custom preset name will
    // surface as unknownRegistryKey below, which lists the built-ins the user can name instead.
    config = { tokens: { color: { accent: '#000000' } } };
  }
  const registries = buildRegistries(config);

  const preset = registries.presets.get(presetName, { file: relative(cwd, path) });
  const files = await listPngs(path);
  if (files.length === 0) {
    process.stderr.write(`mediakit: no PNGs found at ${relative(cwd, path)}.\n`);
    return 1;
  }

  const violations: Violation[] = [];
  for (const file of files) {
    const png = await readFile(file);
    violations.push(...checkAsset(preset, presetName, png, relative(cwd, file)));
  }

  report(violations);
  if (violations.length > 0) {
    process.stderr.write(`mediakit: ${violations.length} violation(s).\n`);
    return 1;
  }
  process.stdout.write(`mediakit: ${files.length} file(s) OK for preset "${presetName}".\n`);
  return 0;
};

const runSpecCheck = async (
  specPath: string,
  outFlag: string | undefined,
  cwd: string,
): Promise<number> => {
  if (!existsSync(specPath)) {
    process.stderr.write(`mediakit: spec file not found: ${relative(cwd, specPath)}\n`);
    return 1;
  }

  const configPath = resolveConfigPath(cwd);
  const config = await importConfig(configPath);
  const registries = buildRegistries(config);

  const specRel = relative(cwd, specPath);
  const raw = await readFile(specPath, 'utf8');
  let specJson: unknown;
  try {
    specJson = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MediakitError(`Invalid JSON in ${specRel}: ${message}`);
  }
  const spec = parseSpec(specJson, specRel);

  const violations = checkSpec(spec, registries, config.brandRules, specRel);

  // Pixel checks against rendered output, if it exists. Skipped silently when nothing has been
  // rendered yet, so check-before-render still validates the spec.
  const outDir = resolve(cwd, outFlag ?? config.outDir ?? 'marketing');
  const allPresets = presetNames(spec);

  for (const presetName of allPresets) {
    // checkSpec already reported this one; skip the pixel pass rather than throw.
    if (!registries.presets.has(presetName)) continue;
    const preset = registries.presets.get(presetName, { file: specRel });
    if (preset.constraints === undefined) continue;

    const dir = outputDir(outDir, spec, presetName, allPresets);
    if (!existsSync(dir)) continue;

    const files = (await listPngs(dir)).sort();
    for (const file of files) {
      const png = await readFile(file);
      violations.push(...checkAsset(preset, presetName, png, relative(cwd, file)));
    }

    if (files.length === 0) {
      violations.push({
        preset: presetName,
        message: `no rendered output found at ${relative(cwd, dir)} for pixel checks.`,
      });
    }
  }

  report(violations);
  if (violations.length > 0) {
    process.stderr.write(`mediakit: ${violations.length} violation(s).\n`);
    return 1;
  }
  process.stdout.write('mediakit: spec OK.\n');
  return 0;
};
