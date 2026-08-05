import process from 'node:process';
import { runInit } from './commands/init.js';

export {
  importConfig,
  needsStripTypesFlag,
  resolveConfigPath,
  stripTypesAvailable,
  stripTypesUnflagged,
} from './config.js';

export { runInit };

const USAGE = `mediakit <command> [args]

commands:
  init     scaffold mediakit.config.ts and an example spec
  render   render a spec to one or more presets, writing PNGs to disk
  check    validate specs and brand rules against store constraints
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
    case 'render':
    case 'check': {
      process.stderr.write(`mediakit: "${command}" is not implemented yet.\n`);
      return Promise.resolve(1);
    }
    default:
      process.stderr.write(
        `mediakit: unknown command "${command}". Available: init, render, check.\n`,
      );
      return Promise.resolve(1);
  }
};
