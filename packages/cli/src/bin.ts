import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from './index.js';
import { needsStripTypesFlag } from './config.js';

const STRIP_TYPES = '--experimental-strip-types';

if (needsStripTypesFlag(process.versions.node, process.execArgv)) {
  // The re-exec keeps a TypeScript config working without a transpiler dependency, which the
  // install-size budget rules out and the ESM-only invariant already constrains. The flag is
  // a no-op on Node 23.6+, activating on 22.6 through 23.5, and the failure message a pre-22.6
  // host gets is Node's own "bad option", which is at least honest.
  const entry = fileURLToPath(import.meta.url);
  const result = spawnSync(process.execPath, [STRIP_TYPES, entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

// Every command resolves to its exit code rather than calling process.exit itself, so the
// bin is the one place that turns it into one. Dropping it here would make `check` report
// violations and still exit 0, which is the failure the command exists to prevent.
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mediakit: ${message}\n`);
    process.exitCode = 1;
  });
