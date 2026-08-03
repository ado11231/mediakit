import { readFile } from 'node:fs/promises';
import { MediakitError, type FontSource, type ResolvedTokens } from '@mediakit/core';

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type FontWeight = (typeof WEIGHTS)[number];

export interface LoadedFont {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: 'normal' | 'italic';
}

const isFontWeight = (weight: number): weight is FontWeight =>
  (WEIGHTS as readonly number[]).includes(weight);

const families = (tokens: ResolvedTokens): readonly FontSource[] => {
  const { display, body } = tokens.font;
  return display.family === body.family && display.files === body.files
    ? [display]
    : [display, body];
};

/**
 * satori substitutes a missing weight silently, so a screenshot rendered at the wrong weight
 * ships with no warning anywhere. That is the worst outcome on the failure table, and this is
 * the only place it can be caught.
 *
 * The rule is that every loaded family must cover every weight the type scale names, because
 * a type token is an open string: `Headline` reads the display family and `Body` reads the
 * body family, and either block can be pointed at any token. Checking only the pairs a given
 * spec happens to use would pass today and fail on a spec written next week.
 */
const assertWeightsLoaded = (tokens: ResolvedTokens, sources: readonly FontSource[]): void => {
  const referenced = [...new Set(Object.values(tokens.type).map((style) => style.fontWeight))];

  for (const source of sources) {
    const available = new Set(source.files.map((file) => file.weight));
    const missing = referenced.filter((weight) => !available.has(weight)).sort((a, b) => a - b);
    if (missing.length === 0) continue;

    const names = Object.entries(tokens.type)
      .filter(([, style]) => missing.includes(style.fontWeight))
      .map(([name, style]) => `  type.${name} needs weight ${style.fontWeight}`)
      .join('\n');

    throw new MediakitError(
      `The font family "${source.family}" is loaded at weights ` +
        `${[...available].sort((a, b) => a - b).join(', ')}, but the type scale references ` +
        `${missing.join(', ')}.\n${names}\n` +
        `Add the missing weight files to tokens.font, or point those type tokens at a weight ` +
        `you ship. satori substitutes a missing weight silently rather than failing, so this ` +
        `would otherwise render at the wrong weight with nothing to point at.`,
    );
  }
};

export const loadFonts = async (tokens: ResolvedTokens): Promise<LoadedFont[]> => {
  const sources = families(tokens);
  assertWeightsLoaded(tokens, sources);

  const loaded = sources.flatMap((source) =>
    source.files.map(async (file): Promise<LoadedFont> => {
      if (!isFontWeight(file.weight)) {
        throw new MediakitError(
          `Font "${source.family}" declares weight ${file.weight} at ${file.path}, which is not ` +
            `a CSS weight. Use one of ${WEIGHTS.join(', ')}.`,
        );
      }

      const data = await readFile(file.path).catch((cause: unknown) => {
        throw new MediakitError(
          `Cannot read the font file for "${source.family}" weight ${file.weight}:\n` +
            `  ${file.path}\n` +
            `Font paths are explicit by design: mediakit never resolves fonts from node_modules ` +
            `and never fetches them, because a render that depends on a network response is not ` +
            `reproducible.\n  cause: ${String(cause)}`,
        );
      });

      return { name: source.family, data, weight: file.weight, style: file.style ?? 'normal' };
    }),
  );

  return Promise.all(loaded);
};
