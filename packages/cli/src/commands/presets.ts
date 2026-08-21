import process from 'node:process';
import {
  createDefaultRegistries,
  LISTING_PRESETS,
  SOCIAL_PRESETS,
  WEB_PRESETS,
} from '@mediakit/core';
import { findConfigPath, importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, describeConstraint } from '../workspace.js';
import { dim } from '../style.js';

const USAGE = `mediakit presets [--config <path>]

List every registered preset with its dimensions and the channel constraints
\`check\` and \`export\` enforce against it. Presets registered by your config
appear alongside the built-ins.

Options:
  --config <path>   use this config instead of mediakit.config.ts in cwd
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

const GROUPS: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
  ['social', SOCIAL_PRESETS],
  ['listing', LISTING_PRESETS],
  ['web', WEB_PRESETS],
];

const groupOf = (name: string): string => {
  for (const [label, bag] of GROUPS) if (name in bag) return label;
  // Anything not built in came from the consumer's config, which is the case worth surfacing:
  // it is the only confirmation available that a custom registration actually took effect.
  return 'custom';
};

interface PresetsDeps {
  cwd?: string;
}

export const runPresets = async (
  argv: readonly string[],
  deps: PresetsDeps = {},
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

  // Built-ins only when there is no project yet. A config that exists but fails to import
  // still throws, since a silent fallback there would report a custom preset as missing.
  const configPath =
    configFlag === undefined ? findConfigPath(cwd) : resolveConfigPath(cwd, configFlag);
  const registries =
    configPath === undefined
      ? createDefaultRegistries()
      : buildRegistries(await importConfig(configPath));

  const names = registries.presets.names();
  const width = Math.max(...names.map((n) => n.length));

  for (const name of names) {
    const preset = registries.presets.get(name);
    const size = `${preset.width}x${preset.height}`;
    const rules = (preset.constraints ?? []).map(describeConstraint).join(', ');
    const group = groupOf(name);
    process.stdout.write(
      `${name.padEnd(width)}  ${size.padEnd(11)} ${dim(group.padEnd(8))} ${rules}\n`,
    );
  }

  process.stdout.write(
    `\n${names.length} presets. ${dim('Name one in a spec\'s "preset" field, then `mediakit render`.')}\n`,
  );
  return 0;
};
