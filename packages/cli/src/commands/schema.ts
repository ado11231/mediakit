import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveTokens, specJsonSchema, vocabularyMarkdown } from '@mediakit/core';
import { findConfigPath, importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, displayPath } from '../workspace.js';
import { dim, ok } from '../style.js';

const USAGE = `mediakit schema [--format json|md] [--out <file>] [--config <path>]

Print this project's spec vocabulary: every registered preset, layout, block,
and colour token. Custom registrations from your config are included, so an
LLM handed this output can author a spec using your own blocks.

  --format json   JSON Schema for a valid spec (default), for structured output
  --format md     the same vocabulary as prose, for a prompt or a human
  --out <file>    write to a file instead of stdout
  --config <path> use this config instead of mediakit.config.ts in cwd
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

interface SchemaDeps {
  cwd?: string;
}

export const runSchema = async (
  argv: readonly string[],
  deps: SchemaDeps = {},
): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  for (const flag of ['--format', '--out', '--config']) {
    if (argv.includes(flag) && findValue(argv, flag) === undefined) {
      process.stderr.write(`mediakit: ${flag} requires a value.\n`);
      return 1;
    }
  }

  const format = findValue(argv, '--format') ?? 'json';
  if (format !== 'json' && format !== 'md') {
    process.stderr.write(`mediakit: --format must be "json" or "md", received "${format}".\n`);
    return 1;
  }
  const outFlag = findValue(argv, '--out');
  const configFlag = findValue(argv, '--config');
  const cwd = deps.cwd ?? process.cwd();

  // Like `presets`, this is useful before a project exists: it is how someone decides whether
  // the built-in vocabulary covers what they need. A config that exists but fails to import
  // still throws, since silence there would omit the consumer's own blocks.
  const configPath =
    configFlag === undefined ? findConfigPath(cwd) : resolveConfigPath(cwd, configFlag);
  const config = configPath === undefined ? undefined : await importConfig(configPath);
  const registries = buildRegistries(config ?? { tokens: { color: { accent: '#2563EB' } } });

  // Colour tokens are scale invariant, so any scale resolves the same names.
  const colors =
    config === undefined
      ? undefined
      : Object.keys(resolveTokens(config.tokens, 1).color).sort();

  const output =
    format === 'md'
      ? vocabularyMarkdown({ registries, colors })
      : `${JSON.stringify(specJsonSchema({ registries, colors }), null, 2)}\n`;

  if (outFlag === undefined) {
    process.stdout.write(output);
    return 0;
  }

  const target = resolve(cwd, outFlag);
  await writeFile(target, output, 'utf8');
  process.stdout.write(
    `${ok('wrote')} ${displayPath(cwd, target)}\n` +
      `  ${dim(`${registries.blocks.size} blocks, ${registries.layouts.size} layouts, ${registries.presets.size} presets.`)}\n`,
  );
  return 0;
};
