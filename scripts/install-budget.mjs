import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Consumers judge build tooling on install weight, and README's competitive line against
 * framedeck rests on it. Bundle size is the wrong metric for a devDependency, so this gates on
 * installed bytes and total transitive dependency count.
 *
 * Two parts, because they are measured differently. mediakit's own packages are weighed by
 * packing them, which counts the `files` field and the bundled font exactly as a consumer
 * receives them. The third-party closure is weighed by installing the union of every external
 * dependency into an empty project, which is the part that actually grows without anyone
 * noticing. Reading this repo's node_modules would count turbo, vitest, and eslint, which no
 * consumer installs.
 *
 * Measured at 18.3 MB across 29 packages in August 2026 (satori, resvg, zod, and their
 * closure). Headroom is deliberately thin: a loose budget passes every regression it exists to
 * catch. resvg ships per-platform binaries, so the exact byte count moves a little between
 * macOS and Linux, which the margin absorbs.
 */
const BUDGET = {
  bytes: 30 * 1024 * 1024,
  packages: 45,
};

const root = fileURLToPath(new URL('..', import.meta.url));
const workspaces = ['core', 'blocks', 'render-still', 'cli'];

const dirSize = (dir) => {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
};

const scratch = mkdtempSync(join(tmpdir(), 'mediakit-budget-'));
try {
  const external = {};
  let ownBytes = 0;

  for (const name of workspaces) {
    const pkgDir = join(root, 'packages', name);
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!dep.startsWith('@mediakit/')) external[dep] = range;
    }

    const packed = join(scratch, name);
    mkdirSync(packed, { recursive: true });
    execFileSync('pnpm', ['pack', '--pack-destination', packed], {
      cwd: pkgDir,
      stdio: 'pipe',
    });
    const tarball = join(packed, readdirSync(packed)[0]);
    execFileSync('tar', ['xzf', tarball, '-C', packed]);
    ownBytes += dirSize(join(packed, 'package'));
  }

  const consumer = join(scratch, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'c', private: true, version: '1.0.0', dependencies: external }),
  );
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], {
    cwd: consumer,
    stdio: 'pipe',
  });

  const depBytes = dirSize(join(consumer, 'node_modules'));
  const packages =
    execFileSync('npm', ['ls', '--all', '--parseable'], { cwd: consumer, encoding: 'utf8' })
      .trim()
      .split('\n').length -
    1 +
    workspaces.length;

  const bytes = ownBytes + depBytes;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  console.log(`mediakit packages: ${mb(ownBytes)}`);
  console.log(`third-party deps:  ${mb(depBytes)}`);
  console.log(`installed size:    ${mb(bytes)} (budget ${mb(BUDGET.bytes)})`);
  console.log(`package count:     ${packages} (budget ${BUDGET.packages})`);
  console.log(`external deps:     ${Object.keys(external).sort().join(', ')}`);

  const over = [];
  if (bytes > BUDGET.bytes) over.push(`size ${mb(bytes)} exceeds ${mb(BUDGET.bytes)}`);
  if (packages > BUDGET.packages) over.push(`count ${packages} exceeds ${BUDGET.packages}`);
  if (over.length > 0) {
    console.error(`\ninstall budget exceeded: ${over.join('; ')}`);
    console.error('Adding a dependency needs justifying in the PR description. See CLAUDE.md.');
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
