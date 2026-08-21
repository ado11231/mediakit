import process from 'node:process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import {
  checkAsset,
  MediakitError,
  parseSpec,
  presetNames,
  type Registries,
  type Violation,
} from '@mediakit/core';
import { renderSpec } from '@mediakit/render-still';
import { importConfig, resolveConfigPath } from '../config.js';
import {
  buildRegistries,
  checkSpecFully,
  describeConstraint,
  displayPath,
} from '../workspace.js';
import { bad, dim, ok } from '../style.js';

const USAGE = `mediakit export <spec> [--preset <name>] [--out <dir>] [--config <path>]

Write an upload-ready folder per preset: flat, ordered filenames plus a
manifest recording what was verified. Every spec and asset constraint is
checked before anything is written, so a bundle that exists is a bundle that
passed.

Options:
  --preset <name>   export only this preset, which must be one the spec names
  --out <dir>       write under this directory instead of export/
  --config <path>   use this config instead of mediakit.config.ts in cwd
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

interface ManifestFrame {
  file: string;
  bytes: number;
  sha256: string;
}

interface Manifest {
  spec: string;
  preset: string;
  width: number;
  height: number;
  frames: readonly ManifestFrame[];
  verified: readonly string[];
}

interface Bundle {
  preset: string;
  dir: string;
  manifest: Manifest;
  files: readonly { path: string; png: Buffer }[];
}

interface ExportDeps {
  cwd?: string;
}

const report = (violations: readonly Violation[]): void => {
  for (const v of violations) {
    const where = [v.preset, v.file].filter(Boolean).join(' ');
    process.stderr.write(bad(`${where ? `${where}: ` : ''}${v.message}\n`));
  }
};

export const runExport = async (
  argv: readonly string[],
  deps: ExportDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const positional = argv.filter((a) => !a.startsWith('-'));
  const specArg = positional[0];
  if (specArg === undefined) {
    process.stderr.write('mediakit: export needs a spec path.\n');
    return 1;
  }

  for (const flag of ['--preset', '--out', '--config']) {
    if (argv.includes(flag) && findValue(argv, flag) === undefined) {
      process.stderr.write(`mediakit: ${flag} requires a value.\n`);
      return 1;
    }
  }
  const namedPreset = findValue(argv, '--preset');
  const outFlag = findValue(argv, '--out');
  const configFlag = findValue(argv, '--config');

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

  // Spec-level rules first: they cost nothing and a frame-count violation makes every render
  // that follows wasted work.
  const specViolations = await checkSpecFully(spec, registries, config, specRel);
  if (specViolations.length > 0) {
    report(specViolations);
    process.stderr.write(bad(`\nexport aborted: ${specViolations.length} violation(s).\n`));
    return 1;
  }

  const outDir = resolve(cwd, outFlag ?? 'export');
  const pad = (n: number): string => String(n + 1).padStart(2, '0');
  const sha = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

  // Everything is rendered and verified into memory before a single file is written. A
  // half-written bundle is worse than no bundle: the folder is the thing a person drags into
  // an upload form, and a partial one uploads without complaint.
  const bundles: Bundle[] = [];
  const violations: Violation[] = [];

  for (const presetName of desired) {
    const preset = registries.presets.get(presetName, { file: specRel });
    const frames = await renderSpec({
      spec,
      registries,
      tokens: config.tokens,
      preset: presetName,
      file: specRel,
    });

    const dir = join(outDir, spec.id, presetName);
    const files = frames.map((frame) => ({
      // Zero-padded and prefixed with the spec id: upload forms order by filename, and a
      // person selecting several bundles at once needs to see which spec each file came from.
      path: join(dir, `${spec.id}-${pad(frame.index)}.png`),
      png: frame.png,
    }));

    for (const file of files) {
      violations.push(...checkAsset(preset, presetName, file.png, displayPath(cwd, file.path)));
    }

    bundles.push({
      preset: presetName,
      dir,
      files,
      manifest: {
        spec: spec.id,
        preset: presetName,
        width: preset.width,
        height: preset.height,
        frames: files.map((f) => ({
          file: relative(dir, f.path),
          bytes: f.png.length,
          sha256: sha(f.png),
        })),
        verified: (preset.constraints ?? []).map(describeConstraint),
        // Deliberately carries no timestamp and no mediakit version. Either would make the
        // manifest's bytes change while the spec did not, which is invariant 7, and the
        // bundle is an artifact like any other rendered output.
      },
    });
  }

  if (violations.length > 0) {
    report(violations);
    process.stderr.write(
      bad(`\nexport aborted: ${violations.length} violation(s). Nothing written.\n`),
    );
    return 1;
  }

  let bytes = 0;
  let count = 0;
  for (const bundle of bundles) {
    // A stale frame from a previous export with more frames would otherwise sit in the folder
    // and be uploaded alongside the current set.
    await rm(bundle.dir, { recursive: true, force: true });
    await mkdir(bundle.dir, { recursive: true });

    for (const file of bundle.files) {
      await writeFile(file.path, file.png);
      bytes += file.png.length;
      count += 1;
      process.stdout.write(
        `${ok('wrote')} ${displayPath(cwd, file.path)} ${dim(`(sha256:${sha(file.png).slice(0, 16)}…)`)}\n`,
      );
    }

    await writeFile(
      join(bundle.dir, 'manifest.json'),
      `${JSON.stringify(bundle.manifest, null, 2)}\n`,
      'utf8',
    );
  }

  const mb = (bytes / 1_000_000).toFixed(2);
  process.stdout.write(
    `\n${ok('✓')} ${count} frame(s) across ${bundles.length} preset(s), ${mb} MB.\n` +
      `  ${dim(displayPath(cwd, outDir))}\n` +
      `  ${dim('Every frame passed its channel constraints. Upload the folder as it is.')}\n`,
  );
  return 0;
};
