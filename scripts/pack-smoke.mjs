import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

/**
 * Both streams are kept from the last command, because a warning is not a failure and is
 * still a defect here, and the two kinds land on different streams: Node's
 * MODULE_TYPELESS_PACKAGE_JSON goes to stderr, while mediakit's own rule warnings go to
 * stdout beside the render report. Checking one stream silently checks nothing.
 */
let lastOutput = '';

const run = (cmd, args, cwd) => {
  lastOutput = '';
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.error) throw result.error;
  lastOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    const parts = [`command failed: ${cmd} ${args.join(' ')}`];
    if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
    if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
    throw new Error(parts.join('\n'));
  }
  return result.stdout;
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

  const dependencies = Object.fromEntries(
    Object.entries(tarballs).map(([name, path]) => [name, `file:${path}`]),
  );

  /**
   * Two project shapes, because they are two different code paths and only one of them was
   * ever tested here. A consumer that declares `type: "module"` gets a `.ts` config; a project
   * made by `npm init -y` declares no type at all, and a `.ts` config there makes Node guess
   * the module system, warn, and reparse on every single command. The typeless shape is the
   * more common one in the wild, so testing only the ESM one tested the rarer case.
   */
  const walk = (label, moduleType, expectedConfig) => {
    const consumer = join(scratch, `consumer-${label}`);
    mkdirSync(consumer, { recursive: true });
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify(
        {
          name: `mediakit-pack-smoke-${label}`,
          private: true,
          version: '1.0.0',
          ...(moduleType === undefined ? {} : { type: moduleType }),
          dependencies,
        },
        null,
        2,
      ),
    );

    run('npm', ['install', '--no-audit', '--no-fund'], consumer);

    const bin = join(consumer, 'node_modules', '.bin', 'mediakit');
    assert(
      existsSync(bin),
      `[${label}] the mediakit bin was not linked at ${bin} after install`,
    );

    // The exact first-run path from the README: one package installed, then presets, init,
    // render, check, export.
    // presets runs before init on purpose: it is the one command that must work with no
    // config present, and a stranger deciding whether to adopt mediakit runs it first.
    const presets = run(bin, ['presets'], consumer);
    assert(
      /ios-6\.9\s+1320x2868/.test(presets),
      `[${label}] presets did not list the built-in listing sizes`,
    );

    run(bin, ['init'], consumer);
    const config = join(consumer, expectedConfig);
    assert(existsSync(config), `[${label}] init did not scaffold ${expectedConfig}`);
    assert(
      /from 'mediakit'/.test(readFileSync(config, 'utf8')),
      `[${label}] the scaffolded config must import from 'mediakit', the one package a consumer installed`,
    );

    run(bin, ['render', 'marketing/example.spec.json'], consumer);
    assert(
      !/MODULE_TYPELESS_PACKAGE_JSON/.test(lastOutput),
      `[${label}] render warned about the config's module type. init picked an extension Node` +
        ` had to guess at, so every command in this project prints the same four lines.` +
        `\noutput:\n${lastOutput}`,
    );
    // Nothing mediakit scaffolds may trip mediakit's own rules. A first render that warns about
    // the palette mediakit itself wrote reads as a defect whether or not the rule is right, and
    // it is the first output a stranger ever sees.
    assert(
      !/\bwarning\b/i.test(lastOutput),
      `[${label}] the scaffolded spec warned on its first render:\n${lastOutput}`,
    );

    const png = join(consumer, 'marketing', 'example', 'frame-01.png');
    assert(existsSync(png), `[${label}] render did not write ${png}`);
    const bytes = readFileSync(png);
    assert(
      bytes.length > 0 && bytes.subarray(0, 8).equals(PNG_MAGIC),
      `[${label}] render output is missing the PNG signature`,
    );

    // check exits non-zero on a violation, and run() throws on a non-zero exit, so a passing
    // spec here is the assertion.
    run(bin, ['check', 'marketing/example.spec.json'], consumer);

    run(bin, ['export', 'marketing/example.spec.json'], consumer);
    const bundle = join(consumer, 'export', 'example', 'ig-portrait');
    const exported = readdirSync(bundle).sort();
    assert(
      exported.join(',') === 'example-01.png,manifest.json',
      `[${label}] export bundle should hold one ordered frame and a manifest, found: ${exported.join(', ')}`,
    );

    // The manifest is an artifact, so a clock-dependent field in it breaks reproducibility the
    // same way a dated watermark would.
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
    assert(
      manifest.sha256 === undefined &&
        !/\d{4}-\d{2}-\d{2}/.test(readFileSync(join(bundle, 'manifest.json'), 'utf8')),
      `[${label}] the export manifest must carry no date`,
    );
    assert(
      createHash('sha256')
        .update(readFileSync(join(bundle, 'example-01.png')))
        .digest('hex') === manifest.frames[0].sha256,
      `[${label}] the export manifest sha256 does not match the bytes it names`,
    );

    return { config: expectedConfig, bytes: bytes.length };
  };

  const esm = walk('esm', 'module', 'mediakit.config.ts');
  const typeless = walk('typeless', undefined, 'mediakit.config.mts');

  // The config's extension is a loading detail and must not reach the pixels.
  assert(
    esm.bytes === typeless.bytes,
    `the two project shapes rendered different output (${esm.bytes} vs ${typeless.bytes} bytes)`,
  );

  console.log('pack-smoke: ok');
  console.log(`  installed from tarballs: ${Object.keys(tarballs).sort().join(', ')}`);
  console.log(`  type: module   -> ${esm.config}, ${esm.bytes} bytes, no warnings`);
  console.log(`  no type field  -> ${typeless.config}, ${typeless.bytes} bytes, no warnings`);
  console.log('  exported: export/example/ig-portrait/ (example-01.png, manifest.json)');
} catch (error) {
  console.error(
    `pack-smoke failed:\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
