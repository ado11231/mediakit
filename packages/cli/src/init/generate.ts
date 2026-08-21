import type { Assignment, FontCandidate } from './extract.js';

/**
 * Writes the scaffolded config with its provenance inline.
 *
 * The comments are the feature, not decoration. Invariant 11 justifies inference only because
 * a human reviews what it wrote, and a reviewer cannot check a hex value without knowing which
 * source token it came from or, where nothing matched, what rule picked it. A `GUESS` marker
 * survives into the committed file and into code review, where the terminal output does not.
 */
const colorBlock = (assignments: readonly Assignment[]): string => {
  const width = Math.max(...assignments.map((a) => a.key.length));
  return assignments
    .map((a) => {
      const note = a.inferred ? `from ${a.source}` : `GUESS: ${a.source}`;
      return `      ${`${a.key}:`.padEnd(width + 1)} '${a.value}', // ${note}`;
    })
    .join('\n');
};

const fontBlock = (font: FontCandidate | undefined): string =>
  font === undefined
    ? ''
    : `
    font: {
      display: sans,
      body: sans,
    },`;

const fontPreamble = (font: FontCandidate | undefined, relative: boolean): string => {
  if (font === undefined) return '';
  const files = font.files
    .map(
      (f) =>
        `    { path: ${relative ? `join(here, '${f.path}')` : `'${f.path}'`}, weight: ${f.weight}, style: 'normal' },`,
    )
    .join('\n');
  return `
// Font paths are absolute by design: mediakit never resolves fonts from node_modules and never
// fetches them, because a render that depends on a network response is not reproducible.
const sans = {
  family: '${font.family}',
  files: [
${files}
  ],
};
`;
};

export interface GenerateOptions {
  assignments: readonly Assignment[];
  font?: FontCandidate | undefined;
  /** Where the palette came from, recorded so a re-run has something to compare against. */
  source?: string | undefined;
}

export const generateConfig = (options: GenerateOptions): string => {
  const { assignments, font, source } = options;
  const usesHere = font !== undefined && font.files.some((f) => !f.path.startsWith('/'));

  return `import { defineConfig } from 'mediakit';${
    usesHere ? "\nimport { join } from 'node:path';\n\nconst here = import.meta.dirname;" : ''
  }
${source === undefined ? '' : `\n// Colours extracted from ${source} by \`mediakit init --from\`.\n// Every GUESS below needs a human decision; the rest name the token they came from.`}
${fontPreamble(font, usesHere)}
export default defineConfig({
  tokens: {
    color: {
${colorBlock(assignments)}
    },${fontBlock(font)}
  },
});
`;
};
