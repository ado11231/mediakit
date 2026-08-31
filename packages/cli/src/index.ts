import process from 'node:process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from './commands/init.js';
import { runNew } from './commands/new.js';
import { runRender } from './commands/render.js';
import { runCheck } from './commands/check.js';
import { runExport } from './commands/export.js';
import { runPresets } from './commands/presets.js';
import { runSchema } from './commands/schema.js';
import { runDoctor } from './commands/doctor.js';
import { runPreview } from './commands/preview.js';

export {
  importConfig,
  needsStripTypesFlag,
  resolveConfigPath,
  stripTypesAvailable,
  stripTypesUnflagged,
} from './config.js';
export type { ImportConfigOptions } from './config.js';

export { runInit };
export { runNew };
export { runRender };
export { runCheck };
export { runExport };
export { runPresets };
export { runSchema };
export { runDoctor };
export { runPreview };

/**
 * One table drives the help text, the dispatch, and the unknown-command message. They were
 * three separate lists, which is how the help and the error came to print the same nine
 * commands in two different orders.
 *
 * Ordered by the sequence someone meets them in: set up a project, write and look at assets,
 * then ship them. The last three answer questions rather than producing anything.
 */
const COMMANDS: Readonly<
  Record<string, { summary: string; run: (argv: readonly string[]) => Promise<number> }>
> = {
  init: { summary: 'scaffold a config and an example spec', run: runInit },
  new: { summary: 'write a complete spec from a template, leaving only the copy', run: runNew },
  render: { summary: 'render a spec to PNGs, once per preset it names', run: runRender },
  preview: { summary: "serve a spec's rendered PNGs with live reload", run: runPreview },
  check: { summary: 'validate a spec, its text, and its images', run: runCheck },
  export: { summary: 'write a verified, upload-ready folder per preset', run: runExport },
  presets: { summary: 'list every registered preset and its rules', run: runPresets },
  schema: { summary: 'print the spec vocabulary, as JSON Schema or prose', run: runSchema },
  doctor: { summary: 'check Node, config, fonts, and the type scale', run: runDoctor },
};

const names = (): string[] => Object.keys(COMMANDS);

const pad = (width: number, text: string): string => text.padEnd(width);

const usage = (): string => {
  const width = Math.max(...names().map((n) => n.length)) + 2;
  const lines = names().map((n) => `  ${pad(width, n)}${COMMANDS[n]?.summary ?? ''}`);
  return `mediakit <command> [args]\n\ncommands:\n${lines.join('\n')}\n\nRun \`mediakit <command> --help\` for a command's own options.\n`;
};

/**
 * Read lazily rather than at import, because importing the CLI should cost nothing, and the
 * only caller is a flag that prints and exits. The version matters more here than in most
 * tools: mediakit makes no network requests ever (invariant 8), so there is no update check
 * and no telemetry, and the number a person reads off this line is the only way a bug report
 * can say which build produced an asset.
 */
const version = (): string => {
  try {
    const manifest = join(import.meta.dirname, '..', 'package.json');
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    const value =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined;
    return typeof value === 'string' ? value : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const main = (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;

  if (command === '--help' || command === '-h' || command === undefined) {
    process.stdout.write(usage());
    return Promise.resolve(0);
  }

  if (command === '--version' || command === '-v') {
    process.stdout.write(`${version()}\n`);
    return Promise.resolve(0);
  }

  const entry = COMMANDS[command];
  if (entry === undefined) {
    process.stderr.write(
      `mediakit: unknown command "${command}".\nCommands: ${names().join(', ')}.\n`,
    );
    return Promise.resolve(1);
  }

  return entry.run(rest);
};
