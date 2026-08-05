import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { MediakitError, type MediakitConfig } from '@mediakit/core';

const CANDIDATES = [
  'mediakit.config.ts',
  'mediakit.config.mts',
  'mediakit.config.js',
  'mediakit.config.mjs',
] as const;

/**
 * strip-types was shipped flag-on in Node 22.6 and unflagged from Node 23.6, so the only
 * versions that need the `--experimental-strip-types` flag are 22.6 through 23.5. Below
 * 22.6 the feature is absent entirely and a `.ts` config cannot load at all; the bin entry
 * surfaces that as a Node-supplied error rather than a silent failure.
 */
const parseNodeVersion = (version: string): { major: number; minor: number } => {
  const match = /^v?(\d+)\.(\d+)\./.exec(version);
  return match === null
    ? { major: 0, minor: 0 }
    : { major: Number(match[1]), minor: Number(match[2]) };
};

const FLAGGED_FROM = { major: 22, minor: 6 };
const UNFLAGGED_FROM = { major: 23, minor: 6 };

const atLeast = (version: string, threshold: { major: number; minor: number }): boolean => {
  const { major, minor } = parseNodeVersion(version);
  return major > threshold.major || (major === threshold.major && minor >= threshold.minor);
};

export const stripTypesAvailable = (version: string): boolean => atLeast(version, FLAGGED_FROM);

export const stripTypesUnflagged = (version: string): boolean =>
  atLeast(version, UNFLAGGED_FROM);

/**
 * Returns true when the bin must re-exec itself with `--experimental-strip-types` before it
 * can `import('./mediakit.config.ts')`. A consumer that ships only a `.js` config pays
 * neither the flag nor the re-exec, but the flag is harmless either way, so the decision is
 * based on the host alone.
 */
export const needsStripTypesFlag = (version: string, execArgv: readonly string[]): boolean => {
  if (execArgv.includes('--experimental-strip-types')) return false;
  return stripTypesAvailable(version) && !stripTypesUnflagged(version);
};

export const resolveConfigPath = (cwd: string): string => {
  const path = CANDIDATES.map((name) => join(cwd, name)).find((p) => existsSync(p));
  if (path === undefined) {
    throw new MediakitError(
      `No mediakit.config.ts found in ${cwd}.\nRun \`mediakit init\` to scaffold one.`,
    );
  }
  return path;
};

/**
 * Loads `mediakit.config.(ts|js)` and returns the `defineConfig` value. `defineConfig` is an
 * identity, so the default export of the consumer's config module is the `MediakitConfig`
 * itself, renderers and all: the bin re-exec happens once before any import, so a `.ts`
 * config reaches this point with strip-types active.
 */
export const importConfig = async (configPath: string): Promise<MediakitConfig> => {
  const module = (await import(pathToFileURL(configPath).href)) as { default: unknown };
  const config = module.default;
  if (
    config === undefined ||
    config === null ||
    typeof config !== 'object' ||
    Array.isArray(config)
  ) {
    throw new MediakitError(
      `Expected a default export of \`defineConfig({...})\` from ${configPath}, received ${
        config === undefined ? 'undefined' : Array.isArray(config) ? 'array' : typeof config
      }.`,
    );
  }
  return config as MediakitConfig;
};
