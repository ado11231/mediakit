import process from 'node:process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDefaultRegistries,
  DEFAULT_FONT,
  DEFAULT_TYPE,
  MediakitError,
  MIN_TEXT_FRACTION,
  resolveTokens,
} from '@mediakit/core';
import {
  flattenModuleTokens,
  groupFontFiles,
  mapToContract,
  parseCssTokens,
  type Assignment,
  type ColorToken,
  type FontCandidate,
} from '../init/extract.js';
import { generateConfig } from '../init/generate.js';
import {
  mapTypeScale,
  parseCssSpacing,
  parseCssTypeSteps,
  parseModuleTypeSteps,
  proposeScale,
  type ScaleProposal,
  type SpaceScale,
  type TypeAssignment,
  type TypeStep,
} from '../init/type-scale.js';
import { bad, dim, ok } from '../style.js';
import { displayPath } from '../workspace.js';

const USAGE = `mediakit init [target] [--from <file>] [--fonts <dir>] [--preset <name>]

Create a config and an example spec that renders on first run with no API key,
no network call, and no manual file copy. The config is written as
mediakit.config.ts when the project already declares ESM, and .mts otherwise.

Options:
  --from <file>    extract colours from a CSS file (:root or @theme) or a
                   TS/JS token module, and report what was inferred vs guessed
  --fonts <dir>    scan this directory for .ttf/.otf files and enumerate weights
  --preset <name>  scaffold the example spec at this preset (default ig-portrait)
  --force          overwrite an existing config
  -h, --help

\`init\` is the only command that infers anything (invariant 11). It runs once,
you review what it wrote, and \`render\` reads that file and does nothing clever.
`;

const DEFAULT_CONFIG = `import { defineConfig } from 'mediakit';

export default defineConfig({
  tokens: {
    color: { accent: '#2563EB' },
  },
});
`;

const CONFIG_NAMES = ['mediakit.config.ts', 'mediakit.config.mts'] as const;

/**
 * Node reads a `.ts` file's module system from the nearest package.json `type` field. With no
 * such field, the common shape of a project created by `npm init -y`, it guesses by parsing,
 * prints MODULE_TYPELESS_PACKAGE_JSON, and reparses. That warning lands on every subsequent
 * mediakit command, including in the middle of `doctor`'s table, and the first thing a stranger
 * sees should not be a Node diagnostic about a file mediakit chose the name of.
 *
 * `.mts` carries the answer in the extension, so there is no lookup and no warning, whatever the
 * consumer's package.json says. `.ts` stays the default where the project already declares ESM,
 * because it is the name the docs use and the one editors are least surprised by.
 */
const configFileName = async (target: string): Promise<string> => {
  for (let dir = target; ;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed: unknown = JSON.parse(await readFile(manifest, 'utf8'));
        const type =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as { type?: unknown }).type
            : undefined;
        return type === 'module' ? CONFIG_NAMES[0] : CONFIG_NAMES[1];
      } catch {
        // An unreadable or malformed manifest is not init's problem to report, and `.mts`
        // is correct under either module system, so it is the safe answer to fall to.
        return CONFIG_NAMES[1];
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return CONFIG_NAMES[1];
    dir = parent;
  }
};

const exampleSpec = (preset: string): string =>
  `${JSON.stringify(
    {
      id: 'example',
      preset,
      frames: [
        {
          layout: 'centered',
          blocks: [
            // `inkMuted` rather than the block's default `accent`: on the default
            // palette accent is 3.74:1 on canvas, so scaffolding the default would
            // make a stranger's very first render warn under mediakit's own contrast
            // rule. The rule is right and the palette is a separate decision; what
            // `init` writes does not have to wait on it.
            { type: 'Eyebrow', props: { text: 'Built with mediakit', color: 'inkMuted' } },
            { type: 'Headline', props: { text: 'Your first asset', align: 'center' } },
            {
              type: 'Body',
              props: {
                text: 'Edit this spec, edit your tokens, then re-render. The same spec plus same tokens plus same fonts produces a byte-identical PNG across runs.',
                align: 'center',
              },
            },
          ],
        },
      ],
    },
    null,
    2,
  )}\n`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

/** Where a project conventionally keeps font files, checked only when --fonts is absent. */
const FONT_DIRS = ['assets/fonts', 'public/fonts', 'src/fonts', 'fonts', 'src/assets/fonts'];

/**
 * Font paths are written relative to the config's own directory, because the config is a
 * committed, reviewed, checked-out file. An absolute path renders on the machine that ran
 * `init` and throws ENOENT on every other checkout, which is the one failure a scaffolder
 * must never create. `generateConfig` turns these back into absolute paths at load time via
 * `import.meta.dirname`, so mediakit still resolves fonts explicitly rather than through
 * `node_modules`.
 *
 * Separators are normalised to `/` so the generated file is identical on every platform,
 * which is what lets a config be compared against a committed expectation.
 */
const portableFontPaths = (font: FontCandidate, configDir: string): FontCandidate => ({
  ...font,
  files: font.files.map((file) => ({
    ...file,
    path: relative(configDir, file.path).split(sep).join('/'),
  })),
});

const fontFilesIn = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(ttf|otf)$/i.test(e.name))
    .map((e) => join(dir, e.name))
    .sort();
};

const readTokens = async (path: string): Promise<ColorToken[]> => {
  const ext = extname(path).toLowerCase();
  if (ext === '.css') return parseCssTokens(await readFile(path, 'utf8'));
  if (['.ts', '.mts', '.js', '.mjs'].includes(ext)) {
    // The whole namespace, not the default export: a token module names its palette
    // (`export const color = ...`) as often as it default-exports one.
    const module: unknown = await import(pathToFileURL(path).href);
    return flattenModuleTokens(module);
  }
  throw new MediakitError(
    `Cannot extract tokens from ${path}: expected a .css file with custom properties, or a ` +
      `.ts/.js token module. Received "${ext || 'no extension'}".`,
  );
};

/**
 * The type ladder and spacing base out of the same source the palette came from. Returns
 * nothing for a source that declares neither, which is the common case for a project whose
 * design system is only colours, and which must stay a silent no-op rather than a warning.
 */
const readScales = async (
  path: string,
): Promise<{ steps: TypeStep[]; space: SpaceScale | undefined }> => {
  const ext = extname(path).toLowerCase();
  if (ext === '.css') {
    const source = await readFile(path, 'utf8');
    return { steps: parseCssTypeSteps(source), space: parseCssSpacing(source) };
  }
  const module: unknown = await import(pathToFileURL(path).href);
  return { steps: parseModuleTypeSteps(module), space: undefined };
};

const report = (
  assignments: readonly Assignment[],
  unused: readonly ColorToken[],
  font: FontCandidate | undefined,
  source: string,
  total: number,
  type: readonly TypeAssignment[],
  space: SpaceScale | undefined,
  scale: ScaleProposal | undefined,
): void => {
  process.stdout.write(`\nRead ${total} colour token(s) from ${dim(source)}.\n\n`);

  const width = Math.max(...assignments.map((a) => a.key.length));
  for (const a of assignments) {
    const label = a.inferred ? ok('inferred') : bad(' guessed');
    process.stdout.write(
      `  ${label}  ${a.key.padEnd(width)}  ${a.value.padEnd(9)} ${dim(
        a.inferred ? `from ${a.source}` : a.source,
      )}\n`,
    );
  }

  const guesses = assignments.filter((a) => !a.inferred).length;
  if (guesses > 0) {
    process.stdout.write(
      `\n  ${bad(`${guesses} value(s) guessed.`)} ${dim('Each is marked GUESS in the config. Check them.')}\n`,
    );
  }

  if (unused.length > 0) {
    // Truncated: a real design system carries dozens of colours, and a wall of them buries the
    // inferred/guessed report above, which is the part that needs reading.
    const shown = unused.slice(0, 12);
    const rest = unused.length - shown.length;
    process.stdout.write(
      `\n  ${dim(`${unused.length} colour(s) found and unused:`)}\n` +
        `  ${dim(shown.map((t) => `${t.name} ${t.value}`).join(', '))}` +
        `${rest > 0 ? dim(`, and ${rest} more`) : ''}\n`,
    );
  }

  process.stdout.write(
    font === undefined
      ? `\n  ${dim('No font files found. The bundled Geist (400, 700) is used.')}\n`
      : `\n  ${ok('fonts')}     ${font.family} at ${font.files.map((f) => f.weight).join(', ')}\n`,
  );

  if (type.length > 0) {
    const keyWidth = Math.max(...type.map((t) => t.key.length));
    process.stdout.write('\n');
    for (const t of type) {
      const label = t.inferred ? ok('inferred') : bad(' guessed');
      process.stdout.write(
        `  ${label}  type.${t.key.padEnd(keyWidth)}  ${String(t.style.fontSize).padStart(3)}px/${
          t.style.fontWeight
        } ${dim(t.inferred ? `from ${t.source}` : t.source)}\n`,
      );
    }
  } else {
    process.stdout.write(
      `  ${dim("No type ladder found. mediakit's default scale is used.")}\n`,
    );
  }

  if (space !== undefined) {
    process.stdout.write(
      `  ${ok('inferred')}  space     ${space.base}px base ${dim(`from ${space.source}`)}\n`,
    );
  }

  if (scale !== undefined) {
    process.stdout.write(
      `\n  ${bad(' guessed')}  scale     ${scale.scale}      ${dim(scale.reason)}\n`,
    );
  } else if (type.length > 0) {
    process.stdout.write(
      `\n  ${dim('No scale written: the scaffolded preset has no store constraints, and a')}\n` +
        `  ${dim('social canvas has its own conventions. Pass --preset ios-6.9 to scaffold for a listing.')}\n`,
    );
  }
};

export const runInit = async (argv: readonly string[]): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  for (const flag of ['--from', '--fonts', '--preset']) {
    if (argv.includes(flag) && findValue(argv, flag) === undefined) {
      process.stderr.write(`mediakit: ${flag} requires a value.\n`);
      return 1;
    }
  }

  const force = argv.includes('--force');
  const fromFlag = findValue(argv, '--from');
  const fontsFlag = findValue(argv, '--fonts');
  const preset = findValue(argv, '--preset') ?? 'ig-portrait';

  const flagValues = new Set([fromFlag, fontsFlag, preset].filter((v) => v !== undefined));
  const targetArg = argv.find((a) => !a.startsWith('-') && !flagValues.has(a));
  const target = resolve(process.cwd(), targetArg ?? '.');

  // Either extension may already be present, and only one of them is the name a fresh run
  // would pick, so looking only at that name would miss a config that is already there.
  const existing = CONFIG_NAMES.find((name) => existsSync(join(target, name)));
  if (existing !== undefined && !force) {
    process.stderr.write(
      `mediakit: ${join(target, existing)} already exists. Pass --force to overwrite.\n`,
    );
    return 1;
  }

  // --force regenerates the config that is there, under the name it already has. Picking the
  // extension afresh would leave the old file beside the new one, and the loader prefers `.ts`,
  // so the stale config would be the one that loads and the overwrite would appear to do nothing.
  const configName = existing ?? (await configFileName(target));
  const configPath = join(target, configName);
  const specDir = join(target, 'marketing');
  const specPath = join(specDir, 'example.spec.json');

  let contents = DEFAULT_CONFIG;

  if (fromFlag !== undefined) {
    const fromPath = resolve(process.cwd(), fromFlag);
    if (!existsSync(fromPath)) {
      process.stderr.write(`mediakit: --from file not found: ${fromFlag}\n`);
      return 1;
    }

    const tokens = await readTokens(fromPath);
    if (tokens.length === 0) {
      process.stderr.write(
        `mediakit: no colour values found in ${fromFlag}.\n` +
          `Expected CSS custom properties under :root or @theme, or a module exporting ` +
          `colour strings.\n`,
      );
      return 1;
    }

    const { assignments, unused } = mapToContract(tokens);

    const fontDirs =
      fontsFlag === undefined
        ? FONT_DIRS.map((d) => join(target, d))
        : [resolve(process.cwd(), fontsFlag)];
    const found = (await Promise.all(fontDirs.map(fontFilesIn))).flat();

    // A discovered family is only usable if it covers every weight the default type scale
    // names. `loadFonts` throws on a missing weight, so accepting a family that ships only
    // 500 and 600 would scaffold a config that cannot render, and `init` must leave the
    // project in a state `render` consumes immediately. Falling back to the bundled font is
    // the correct answer, not a degraded one.
    const required = new Set(Object.values(DEFAULT_TYPE).map((style) => style.fontWeight));
    const font = groupFontFiles(found).find((candidate) => {
      const weights = new Set(candidate.files.map((f) => f.weight));
      return [...required].every((weight) => weights.has(weight));
    });

    // Weights the loaded font actually ships. satori substitutes a missing weight silently,
    // so an extracted scale that names one the font does not have renders wrong with no error,
    // and the extractor snaps to what exists rather than writing what the source asked for.
    const available =
      font === undefined
        ? [...new Set(DEFAULT_FONT.files.map((f) => f.weight))]
        : [...new Set(font.files.map((f) => f.weight))];

    const { steps, space } = await readScales(fromPath);
    const type = mapTypeScale(steps, available);

    const resolved = resolveTokens(
      {
        color: { accent: '#000000' },
        type: Object.fromEntries(type.map((t) => [t.key, t.style])),
      },
      1,
    );
    const presets = createDefaultRegistries().presets;
    const scaffolded = presets.has(preset)
      ? presets.get(preset, { file: configName })
      : undefined;
    const scale =
      scaffolded === undefined
        ? undefined
        : proposeScale(
            resolved.type,
            {
              name: preset,
              width: scaffolded.width,
              constrained: (scaffolded.constraints ?? []).length > 0,
            },
            MIN_TEXT_FRACTION,
          );

    contents = generateConfig({
      assignments,
      font: font === undefined ? undefined : portableFontPaths(font, target),
      // Anchored on the config's directory rather than on cwd, unlike the terminal report
      // below. The two have different readers: the report is read once, beside the command
      // that produced it, and this is read later by someone reviewing the committed file, who
      // needs a path that still means something from wherever they checked the project out.
      source: displayPath(target, fromPath),
      type,
      space,
      scale,
    });
    report(
      assignments,
      unused,
      font,
      displayPath(process.cwd(), fromPath),
      tokens.length,
      type,
      space,
      scale,
    );
  }

  await mkdir(specDir, { recursive: true });
  await writeFile(configPath, contents, 'utf8');
  await writeFile(specPath, exampleSpec(preset), 'utf8');

  const rel = (p: string): string => displayPath(process.cwd(), p);
  process.stdout.write(
    [
      '',
      `${ok('created')} ${rel(configPath)}`,
      `${ok('created')} ${rel(specPath)}`,
      '',
      fromFlag === undefined
        ? `Next: ${dim(`\`mediakit render ${rel(specPath)}\``)}`
        : `Review the config, then: ${dim(`\`mediakit render ${rel(specPath)}\``)}`,
      '',
    ].join('\n'),
  );
  return 0;
};
