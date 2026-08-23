import process from 'node:process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import {
  parsePng,
  parseSpec,
  type MediakitConfig,
  type Registries,
  type TemplateScreen,
} from '@mediakit/core';
import { importConfig, resolveConfigPath } from '../config.js';
import { buildRegistries, displayPath } from '../workspace.js';
import { bad, dim, ok } from '../style.js';

const USAGE = `mediakit new <id> [--template <name>] [--frames <n>] [--preset <name>]

Write a complete spec from a template, so the only thing left to edit is the
copy. Structure is the part nobody has an opinion about the first time.

Options:
  --template <name>  which recipe to use (default: carousel)
  --frames <n>       how many frames to write
  --preset <name>    override the preset the template proposes
  --screen <path>    a rendered screen to place in a device frame
  --out <dir>        write under this directory instead of marketing/
  --config <path>    use this config instead of mediakit.config.ts in cwd
  --force            overwrite an existing spec
  -h, --help
`;

const findValue = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

interface NewDeps {
  cwd?: string;
}

const listTemplates = (registries: Registries): string => {
  const width = Math.max(...registries.templates.names().map((n) => n.length));
  return registries.templates
    .names()
    .map((name) => {
      const template = registries.templates.get(name, { file: 'mediakit.config.ts' });
      return (
        `  ${ok(name.padEnd(width))}  ${template.description}\n` +
        `  ${' '.repeat(width)}  ${dim(
          `${template.frames.default} frames by default, on ${template.presets.join(', ')}`,
        )}`
      );
    })
    .join('\n');
};

export const runNew = async (argv: readonly string[], deps: NewDeps = {}): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  for (const flag of ['--template', '--frames', '--preset', '--screen', '--out', '--config']) {
    if (argv.includes(flag) && findValue(argv, flag) === undefined) {
      process.stderr.write(`mediakit: ${flag} requires a value.\n`);
      return 1;
    }
  }

  const cwd = deps.cwd ?? process.cwd();
  const configFlag = findValue(argv, '--config');
  const config: MediakitConfig = await importConfig(resolveConfigPath(cwd, configFlag));
  const registries = buildRegistries(config);

  const flagValues = new Set(
    ['--template', '--frames', '--preset', '--screen', '--out', '--config']
      .map((flag) => findValue(argv, flag))
      .filter((v) => v !== undefined),
  );
  const id = argv.find((a) => !a.startsWith('-') && !flagValues.has(a));
  if (id === undefined) {
    process.stderr.write(
      `mediakit: new needs an id, which names the spec and its output directory.\n\n` +
        `Templates:\n${listTemplates(registries)}\n`,
    );
    return 1;
  }

  const templateName = findValue(argv, '--template') ?? 'carousel';
  // Resolved through the registry, so an unknown name reports what is registered including
  // anything the consumer added, which is the whole point of the registry being open.
  const template = registries.templates.get(templateName, { file: 'mediakit.config.ts' });

  const presets = (() => {
    const named = findValue(argv, '--preset');
    return named === undefined ? template.presets : [named];
  })();
  for (const preset of presets) {
    if (!registries.presets.has(preset)) {
      registries.presets.get(preset, { file: 'mediakit.config.ts' });
    }
  }

  const framesFlag = findValue(argv, '--frames');
  const frames = framesFlag === undefined ? template.frames.default : Number(framesFlag);
  if (
    !Number.isInteger(frames) ||
    frames < template.frames.min ||
    frames > template.frames.max
  ) {
    process.stderr.write(
      `mediakit: --frames must be a whole number from ${template.frames.min} to ` +
        `${template.frames.max} for the "${templateName}" template.\n`,
    );
    return 1;
  }

  const screenFlag = findValue(argv, '--screen');
  let screen: TemplateScreen | undefined;
  if (screenFlag !== undefined) {
    const screenPath = resolve(cwd, screenFlag);
    if (!existsSync(screenPath)) {
      process.stderr.write(`mediakit: --screen file not found: ${screenFlag}\n`);
      return 1;
    }
    // Its dimensions travel with it: a template has to size the device against the canvas, and
    // it cannot do that without knowing the aspect of what it is framing.
    const png = parsePng(await readFile(screenPath), relative(cwd, screenPath));
    screen = { path: relative(cwd, screenPath), width: png.width, height: png.height };
  }

  const outDir = resolve(cwd, findValue(argv, '--out') ?? config.outDir ?? 'marketing');
  const specPath = join(outDir, `${id}.spec.json`);
  if (existsSync(specPath) && !argv.includes('--force')) {
    process.stderr.write(
      `mediakit: ${displayPath(cwd, specPath)} already exists. Pass --force to overwrite.\n`,
    );
    return 1;
  }

  const canvases = presets.map((name) => {
    const entry = registries.presets.get(name, { file: 'mediakit.config.ts' });
    return { name, width: entry.width, height: entry.height };
  });

  const spec = template.build({ id, presets, canvases, frames, screen });

  // Validated before it is written. A template is consumer code like any other registration,
  // and a spec that fails `parseSpec` is a spec the author would have to debug through a file
  // they did not write.
  parseSpec(spec, displayPath(cwd, specPath));

  await mkdir(outDir, { recursive: true });
  await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `\n${ok('created')} ${displayPath(cwd, specPath)} ${dim(
      `(${frames} frame(s), ${presets.join(', ')})`,
    )}\n\n` +
      `${dim('Every string in it is a placeholder. Edit the copy, then:')}\n` +
      `  ${dim(`\`mediakit render ${displayPath(cwd, specPath)}\``)}\n` +
      (template.wantsScreen && screen === undefined
        ? `\n${bad('note')} ${dim(
            'This template frames a screen. Render one with `mediakit new <id> --template screen`,',
          )}\n     ${dim('then re-run this with --screen marketing/<id>/frame-01.png.')}\n`
        : '') +
      '\n',
  );
  return 0;
};
