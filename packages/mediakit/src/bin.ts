import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, needsStripTypesFlag } from '@mediakit/cli';

// `mediakit` is the published bin, so it owns the strip-types re-exec rather than delegating
// to @mediakit/cli's bin: a consumer installs `mediakit` and gets `mediakit` on PATH, and the
// re-exec has to happen in this process before any `import('./mediakit.config.ts')` runs. The
// logic mirrors @mediakit/cli/src/bin.ts and shares its `needsStripTypesFlag` decision.
const STRIP_TYPES = '--experimental-strip-types';

if (needsStripTypesFlag(process.versions.node, process.execArgv)) {
  const entry = fileURLToPath(import.meta.url);
  const result = spawnSync(process.execPath, [STRIP_TYPES, entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mediakit: ${message}\n`);
    process.exitCode = 1;
  });
