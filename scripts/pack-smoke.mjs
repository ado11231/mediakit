import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Proves the published surface actually installs and runs from outside this workspace, which
 * is the "ready to be tested on a repo" claim. `pnpm typecheck` and `pnpm test` run against
 * workspace symlinks and src, so neither can catch a broken `exports` map, a `files` field
 * that drops `dist`, a missing bin shebang, or a dependency that resolves only because a
 * sibling happens to be linked in the monorepo. This packs every publishable package exactly
 * as a consumer receives it, installs the tarballs into a throwaway project, and walks the
 * first-run path a stranger takes: init, render, check.
 *
 * Every @mediakit/* sibling is provided as a file: dependency on purpose. `pnpm pack` rewrites
 * `workspace:*` to the concrete version, so the packed `mediakit` requires `@mediakit/cli@0.1.0`
 * and friends. Those are not on the registry yet, so supplying the tarballs is what lets the
 * cross-dependencies dedupe locally instead of 404ing. The external closure (satori, resvg,
 * zod) still comes from the registry, exactly as it would for a real consumer.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

// Order is packing order only; the consumer installs all of them together.
const PACKAGES = ['core', 'blocks', 'render-still', 'cli', 'mediakit'];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const parts = [`command failed: ${cmd} ${args.join(' ')}`];
    if (error.stdout) parts.push(`stdout:\n${error.stdout}`);
    if (error.stderr) parts.push(`stderr:\n${error.stderr}`);
    throw new Error(parts.join('\n'));
  }
};

const scratch = mkdtempSync(join(tmpdir(), 'mediakit-pack-smoke-'));
try {
  const tarballs = {};
  for (const name of PACKAGES) {
    const pkgDir = join(root, 'packages', name);
    const dest = join(scratch, 'tarballs', name);
    mkdirSync(dest, { recursive: true });
    run('pnpm', ['pack', '--pack-destination', dest], pkgDir);
    const file = readdirSync(dest).find((f) => f.endsWith('.tgz'));
    assert(file !== undefined, `pnpm pack produced no tarball for ${name}`);
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    tarballs[manifest.name] = join(dest, file);
  }

  const consumer = join(scratch, 'consumer');
  mkdirSync(consumer, { recursive: true });
  const dependencies = Object.fromEntries(
    Object.entries(tarballs).map(([name, path]) => [name, `file:${path}`]),
  );
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'mediakit-pack-smoke-consumer',
        private: true,
        version: '1.0.0',
        type: 'module',
        dependencies,
      },
      null,
      2,
    ),
  );

  run('npm', ['install', '--no-audit', '--no-fund'], consumer);

  const bin = join(consumer, 'node_modules', '.bin', 'mediakit');
  assert(existsSync(bin), `the mediakit bin was not linked at ${bin} after install`);

  // The exact first-run path from the README: one package installed, then init, render, check.
  run(bin, ['init'], consumer);
  const config = join(consumer, 'mediakit.config.ts');
  assert(existsSync(config), 'init did not scaffold mediakit.config.ts');
  assert(
    /from 'mediakit'/.test(readFileSync(config, 'utf8')),
    "the scaffolded config must import from 'mediakit', the one package a consumer installed",
  );

  run(bin, ['render', 'marketing/example.spec.json'], consumer);
  const png = join(consumer, 'marketing', 'example', 'frame-01.png');
  assert(existsSync(png), `render did not write ${png}`);
  const bytes = readFileSync(png);
  assert(
    bytes.length > 0 && bytes.subarray(0, 8).equals(PNG_MAGIC),
    'render output is missing the PNG signature',
  );

  // check exits non-zero on a violation, and run() throws on a non-zero exit, so a passing
  // spec here is the assertion.
  run(bin, ['check', 'marketing/example.spec.json'], consumer);

  console.log('pack-smoke: ok');
  console.log(`  installed from tarballs: ${Object.keys(tarballs).sort().join(', ')}`);
  console.log(`  rendered: marketing/example/frame-01.png (${bytes.length} bytes, PNG)`);
} catch (error) {
  console.error(
    `pack-smoke failed:\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
