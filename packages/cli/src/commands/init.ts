import process from 'node:process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const USAGE = `mediakit init [target]

Create mediakit.config.ts and an example spec that renders on first run with
no API key, no network call, and no manual file copy.

Options:
  --force   overwrite an existing mediakit.config.ts
  -h, --help
`;

const CONFIG_TEMPLATE = `import { defineConfig } from '@mediakit/core';

export default defineConfig({
  tokens: {
    color: { accent: '#2563EB' },
  },
});
`;

const EXAMPLE_SPEC = `{
  "id": "example",
  "preset": "ig-portrait",
  "frames": [
    {
      "layout": "centered",
      "blocks": [
        { "type": "Eyebrow", "props": { "text": "Built with mediakit" } },
        {
          "type": "Headline",
          "props": { "text": "Your first asset", "align": "center" }
        },
        {
          "type": "Body",
          "props": {
            "text": "Edit this spec, edit your tokens, then re-render. The same spec plus same tokens plus same fonts produces a byte-identical PNG across runs.",
            "align": "center"
          }
        }
      ]
    }
  ]
}
`;

export const runInit = async (argv: readonly string[]): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }
  const force = argv.includes('--force');
  const targetArg = argv.find((a) => !a.startsWith('-'));
  const target = resolve(process.cwd(), targetArg ?? '.');

  const configPath = join(target, 'mediakit.config.ts');
  const specDir = join(target, 'marketing');
  const specPath = join(specDir, 'example.spec.json');

  if (existsSync(configPath) && !force) {
    process.stderr.write(
      `mediakit: ${configPath} already exists. Pass --force to overwrite.\n`,
    );
    return 1;
  }

  await mkdir(specDir, { recursive: true });
  await writeFile(configPath, CONFIG_TEMPLATE, 'utf8');
  await writeFile(specPath, EXAMPLE_SPEC, 'utf8');

  process.stdout.write(
    [
      `Created ${configPath}`,
      `Created ${specPath}`,
      `Run \`mediakit render ${specPath}\` to render an image.`,
      '',
    ].join('\n'),
  );
  return 0;
};
