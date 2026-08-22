import process from 'node:process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_TYPE,
  glyphCoverage,
  resolveTokens,
  type FontSource,
  type MediakitConfig,
} from '@mediakit/core';
import {
  findConfigPath,
  importConfig,
  resolveConfigPath,
  stripTypesAvailable,
} from '../config.js';
import { buildRegistries, displayPath } from '../workspace.js';
import { bad, dim, ok } from '../style.js';

const USAGE = `mediakit doctor [--config <path>]

Check the four things that account for most first-run failures: the Node
version, whether a config resolves, whether every font file is on disk, and
whether the loaded weights cover the type scale. Then print what the type
scale actually resolves to on each registered preset, which is the number
nothing else in the CLI shows you.

Options:
  --config <path>   use this config instead of mediakit.config.ts in cwd
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

interface DoctorDeps {
  cwd?: string;
}

const PASS = 'pass';
const FAIL = 'FAIL';

const line = (status: string, label: string, detail: string): void => {
  const painted = status === PASS ? ok(status) : bad(status);
  process.stdout.write(`  ${painted}  ${label.padEnd(18)} ${detail}\n`);
};

const families = (config: MediakitConfig): FontSource[] => {
  const resolved = resolveTokens(config.tokens, 1);
  const { display, body } = resolved.font;
  return display.family === body.family ? [display] : [display, body];
};

export const runDoctor = async (
  argv: readonly string[],
  deps: DoctorDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }
  const configFlag = findValue(argv, '--config');
  if (argv.includes('--config') && configFlag === undefined) {
    process.stderr.write('mediakit: --config requires a value.\n');
    return 1;
  }

  const cwd = deps.cwd ?? process.cwd();
  let failures = 0;
  const fail = (label: string, detail: string): void => {
    failures += 1;
    line(FAIL, label, detail);
  };

  process.stdout.write('\nmediakit doctor\n\n');

  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (major >= 22) line(PASS, 'node', `v${process.versions.node}`);
  else fail('node', `v${process.versions.node}, mediakit needs 22 or newer`);

  // A TypeScript config loads through strip-types rather than a transpiler dependency, so a
  // host below 22.6 can resolve a config path it then cannot import.
  const configPath =
    configFlag === undefined ? findConfigPath(cwd) : resolveConfigPath(cwd, configFlag);
  if (configPath === undefined) {
    fail('config', `no mediakit.config.ts in ${cwd}. Run \`mediakit init\`.`);
    process.stdout.write(`\n${bad(`${failures} check(s) failed.`)}\n\n`);
    return 1;
  }
  line(PASS, 'config', displayPath(cwd, configPath));

  if (configPath.endsWith('.ts') || configPath.endsWith('.mts')) {
    if (stripTypesAvailable(process.versions.node)) {
      line(PASS, 'typescript', 'loaded via --experimental-strip-types');
    } else {
      fail('typescript', 'a .ts config needs Node 22.6 or newer; rename it to .mjs');
    }
  }

  const config = await importConfig(configPath);
  const registries = buildRegistries(config);
  line(
    PASS,
    'registries',
    `${registries.blocks.size} blocks, ${registries.layouts.size} layouts, ${registries.presets.size} presets`,
  );

  const referenced = new Set(
    Object.values(resolveTokens(config.tokens, 1).type).map((s) => s.fontWeight),
  );

  for (const family of families(config)) {
    const missingFiles = family.files.filter((f) => !existsSync(f.path));
    if (missingFiles.length > 0) {
      fail(
        `font ${family.family}`,
        `${missingFiles.length} file(s) not on disk: ${missingFiles.map((f) => f.path).join(', ')}`,
      );
      continue;
    }

    const weights = new Set(family.files.map((f) => f.weight));
    const missing = [...referenced].filter((w) => !weights.has(w)).sort((a, b) => a - b);
    if (missing.length > 0) {
      // satori substitutes a missing weight silently, which is the worst outcome on the
      // failure table: a wrong-weight screenshot with nothing to point at.
      fail(
        `font ${family.family}`,
        `type scale needs ${missing.join(', ')}, loaded ${[...weights].sort((a, b) => a - b).join(', ')}`,
      );
      continue;
    }

    line(
      PASS,
      `font ${family.family}`,
      `${family.files.length} file(s), weights ${[...weights].sort((a, b) => a - b).join(', ')}`,
    );

    const buffers = await Promise.all(family.files.map((f) => readFile(f.path)));
    const covered = new Set<number>();
    let unreadable = false;
    for (const buffer of buffers) {
      const coverage = glyphCoverage(buffer);
      if (coverage === undefined) unreadable = true;
      else for (const code of coverage) covered.add(code);
    }
    line(
      PASS,
      'glyphs',
      unreadable
        ? dim('a font could not be parsed; glyph checking is skipped for this project')
        : `${covered.size} codepoints across ${family.family}`,
    );
  }

  // The number nothing else shows. A type scale authored for an app viewport renders at a
  // fraction of a listing canvas, and the result validates, exports, and uploads.
  process.stdout.write(`\n  ${dim('type scale, resolved per preset (% of canvas width)')}\n`);
  const names = registries.presets.names().filter((n) => {
    const preset = registries.presets.get(n);
    return (preset.constraints ?? []).length > 0;
  });

  const tokenNames = Object.keys(DEFAULT_TYPE);
  process.stdout.write(
    `  ${dim(''.padEnd(20))}${dim(tokenNames.map((t) => t.slice(0, 8).padStart(9)).join(''))}\n`,
  );
  for (const name of names) {
    const preset = registries.presets.get(name);
    const resolved = resolveTokens(config.tokens, preset.scale);
    const cells = tokenNames
      .map((token) => {
        const style = resolved.type[token];
        if (style === undefined) return '        -';
        return `${((style.fontSize / preset.width) * 100).toFixed(1)}%`.padStart(9);
      })
      .join('');
    process.stdout.write(`  ${name.padEnd(20)}${cells}\n`);
  }

  process.stdout.write(
    failures === 0
      ? `\n${ok('mediakit: all checks passed.')} ${dim('Next: `mediakit render <spec>`.')}\n\n`
      : `\n${bad(`mediakit: ${failures} check(s) failed.`)}\n\n`,
  );
  return failures === 0 ? 0 : 1;
};
