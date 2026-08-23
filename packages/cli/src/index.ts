import process from 'node:process';
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

const USAGE = `mediakit <command> [args]

commands:
  init     scaffold mediakit.config.ts and an example spec
  new      write a complete spec from a template, leaving only the copy to edit
  presets  list every registered preset with its dimensions and constraints
  preview  serve a spec's rendered PNGs over HTTP with live reload
  render   render a spec to one or more presets, writing PNGs to disk
  check    validate specs and brand rules against store constraints
  export   write a verified, upload-ready folder per preset
  schema   print the spec vocabulary as JSON Schema or prose
  doctor   check Node, config, fonts, and the resolved type scale
`;

export const main = (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;
  switch (command) {
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(USAGE);
      return Promise.resolve(0);
    case 'init':
      return runInit(rest);
    case 'new':
      return runNew(rest);
    case 'preview':
      return runPreview(rest);
    case 'render':
      return runRender(rest);
    case 'check':
      return runCheck(rest);
    case 'export':
      return runExport(rest);
    case 'presets':
      return runPresets(rest);
    case 'schema':
      return runSchema(rest);
    case 'doctor':
      return runDoctor(rest);
    default:
      process.stderr.write(
        `mediakit: unknown command "${command}". Available: init, new, presets, schema, doctor, preview, render, check, export.\n`,
      );
      return Promise.resolve(1);
  }
};
