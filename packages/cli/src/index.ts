import process from 'node:process';

export {
  importConfig,
  needsStripTypesFlag,
  resolveConfigPath,
  stripTypesAvailable,
  stripTypesUnflagged,
} from './config.js';

const USAGE = `mediakit <command> [args]

commands:
  init     scaffold mediakit.config.ts and an example spec
  render   render a spec to one or more presets, writing PNGs to disk
  check    validate specs and brand rules against store constraints
`;

export const main = (argv: readonly string[]): Promise<number> => {
  const [command] = argv;
  switch (command) {
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(USAGE);
      return Promise.resolve(0);
    case 'init':
    case 'render':
    case 'check': {
      // Implemented in subsequent commits; stubbed here so the scaffold is shippable on
      // its own without a half-wired entry that fails by accident.
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
