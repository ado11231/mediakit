import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The M3 gate: does mediakit work on a design system nobody in this repo wrote?
 *
 * Invariant 11 confines every piece of inference to `init`, so "a second app works" is exactly
 * "`init`'s extraction works on a stranger's tokens". That makes the harness and the milestone
 * the same thing. `pack-smoke` already proves the published surface installs and runs from
 * outside the workspace; it proves nothing about whether the config that comes out is right.
 *
 * Tier 1 only: fixtures that live in this repo, offline, deterministic, safe on every pull
 * request. Tier 2 (pinned SHAs of real public repos, network, run by hand before a release)
 * stays out of CI on purpose, because a gate that can fail on someone else's push is not a gate.
 *
 * The assertion that carries the most weight is the byte-for-byte config comparison. Extraction
 * is a pile of heuristics tuned against real palettes, and the only way to keep a change to one
 * heuristic from silently moving another repo's output is to make every such move show up as a
 * reviewable diff. `--update` rewrites the expectations, on the `generate-golden.mjs` precedent.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'packages', 'mediakit', 'dist', 'bin.js');
const update = process.argv.includes('--update');

/**
 * Each fixture is shaped like a different ecosystem rather than like a different product. The
 * preset matters: `init` scaffolds a one-frame spec, so a preset with a floor of two frames
 * (`play-phone`) would fail `check` for a reason that has nothing to do with extraction.
 */
const FIXTURES = [
  {
    name: 'tailwind-next',
    from: 'app/globals.css',
    fonts: 'fonts',
    preset: 'ios-6.9',
    width: 1320,
    height: 2868,
    proves:
      'Tailwind v4 @theme, a --text-* ladder, an 8px spacing base, font discovery, and relative font paths',
  },
  {
    name: 'expo-tokens',
    from: 'theme/tokens.ts',
    preset: 'ios-6.5',
    width: 1284,
    height: 2778,
    proves:
      'a TS token module with dotted semantic names, a dark palette, and the bundled-font fallback',
  },
  {
    name: 'minimal-vite',
    from: 'src/theme.css',
    preset: 'ig-portrait',
    width: 1080,
    height: 1350,
    proves: 'three colours, no ladder, no fonts: every role still filled, and it still renders',
  },
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = (args, cwd) => {
  try {
    return execFileSync(process.execPath, [bin, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (error) {
    const parts = [`mediakit ${args.join(' ')} failed (exit ${error.status})`];
    if (error.stdout) parts.push(`stdout:\n${error.stdout}`);
    if (error.stderr) parts.push(`stderr:\n${error.stderr}`);
    throw new Error(parts.join('\n'));
  }
};

/** IHDR is always the first chunk, so width and height sit at a fixed offset. */
const pngSize = (buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * A unified-ish diff, because the failure this reports is "extraction moved" and the only
 * useful thing to show is which lines moved. Committing to a diff library for one script
 * would be a dependency on the wrong side of the budget.
 */
const diff = (expected, actual) => {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`  - ${a[i]}`);
    if (b[i] !== undefined) out.push(`  + ${b[i]}`);
  }
  return out.join('\n');
};

const checkFixture = (fixture) => {
  const source = join(root, 'test', 'consumers', fixture.name);
  const scratch = mkdtempSync(join(tmpdir(), `mediakit-conformance-${fixture.name}-`));

  try {
    // `expected/` is the answer key, so it must not be visible to the run being graded.
    cpSync(source, scratch, {
      recursive: true,
      filter: (from) => !from.startsWith(join(source, 'expected')),
    });

    // The generated config does `import { defineConfig } from 'mediakit'`. Node resolves a
    // symlink to its realpath, so the facade's own @mediakit/* dependencies keep resolving
    // out of the workspace: no install, no network, and nothing the registry has to have.
    mkdirSync(join(scratch, 'node_modules'), { recursive: true });
    symlinkSync(join(root, 'packages', 'mediakit'), join(scratch, 'node_modules', 'mediakit'));

    const started = performance.now();

    const initArgs = ['init', '.', '--from', fixture.from, '--preset', fixture.preset];
    if (fixture.fonts !== undefined) initArgs.push('--fonts', fixture.fonts);
    const initOut = run(initArgs, scratch);

    const configPath = join(scratch, 'mediakit.config.ts');
    const config = readFileSync(configPath, 'utf8');

    // The config is a committed, reviewed, checked-out file. A machine-specific path in it
    // renders here and throws ENOENT on every other checkout.
    assert(
      !config.includes(scratch),
      `${fixture.name}: the generated config carries an absolute path from the machine that ` +
        `ran init. It would not resolve on any other checkout.`,
    );

    const expectedPath = join(source, 'expected', 'mediakit.config.ts');
    if (update) {
      mkdirSync(join(source, 'expected'), { recursive: true });
      writeFileSync(expectedPath, config, 'utf8');
    } else {
      const expected = readFileSync(expectedPath, 'utf8');
      assert(
        expected === config,
        `${fixture.name}: extraction no longer produces the committed config.\n` +
          `${diff(expected, config)}\n\n` +
          `  If the new output is correct, re-run with --update and review the diff.`,
      );
    }

    const spec = join('marketing', 'example.spec.json');
    run(['render', spec], scratch);
    const frame = join(scratch, 'marketing', 'example', 'frame-01.png');
    const first = readFileSync(frame);
    const elapsed = performance.now() - started;

    const size = pngSize(first);
    assert(
      size.width === fixture.width && size.height === fixture.height,
      `${fixture.name}: rendered ${size.width}x${size.height}, but preset ${fixture.preset} ` +
        `is ${fixture.width}x${fixture.height}.`,
    );

    // A second render in a second process, which is the only way to tell a reproducible
    // render from a cached one.
    run(['render', spec], scratch);
    const second = readFileSync(frame);
    assert(
      sha256(first) === sha256(second),
      `${fixture.name}: two renders of the same spec produced different bytes.`,
    );

    // Warnings are recorded, not fatal. The default accent is 3.74:1 on the default canvas,
    // a true finding mediakit has not fixed; failing the gate on it would make the harness
    // lie about what it measures.
    const checkOut = run(['check', spec], scratch);

    const unused = /(\d+) colour\(s\) found and unused/.exec(initOut);
    const warnings = /no violations, (\d+) warning\(s\)/.exec(checkOut);

    return {
      name: fixture.name,
      guesses: (config.match(/GUESS/g) ?? []).length,
      unused: unused === null ? 0 : Number(unused[1]),
      warnings: warnings === null ? 0 : Number(warnings[1]),
      seconds: elapsed / 1000,
      sha: sha256(first).slice(0, 16),
      proves: fixture.proves,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const results = [];
const failures = [];

for (const fixture of FIXTURES) {
  try {
    results.push(checkFixture(fixture));
    process.stdout.write(`  ok    ${fixture.name}\n`);
  } catch (error) {
    failures.push(error);
    process.stdout.write(`  FAIL  ${fixture.name}\n`);
  }
}

process.stdout.write('\n');
for (const error of failures) process.stdout.write(`${error.message}\n\n`);

if (results.length > 0) {
  const pad = Math.max(...results.map((r) => r.name.length));
  process.stdout.write(`${'fixture'.padEnd(pad)}  edits  unused  warn  first render  frame\n`);
  for (const r of results) {
    process.stdout.write(
      `${r.name.padEnd(pad)}  ${String(r.guesses).padStart(5)}  ${String(r.unused).padStart(6)}` +
        `  ${String(r.warnings).padStart(4)}  ${`${r.seconds.toFixed(1)}s`.padStart(12)}  ${r.sha}\n`,
    );
  }
  process.stdout.write(
    `\n"edits" is the number of values marked GUESS: the ones a human has to decide.\n` +
      `It is a number to watch move, not a threshold. Timings are terminal-only and never\n` +
      `reach a file, because a duration written into an artifact breaks invariant 7.\n`,
  );
}

if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} of ${FIXTURES.length} fixture(s) failed.\n`);
  process.exitCode = 1;
} else if (update) {
  process.stdout.write(`\nExpectations updated. Review the diff before committing.\n`);
} else {
  process.stdout.write(`\nAll ${FIXTURES.length} fixtures conform.\n`);
}
