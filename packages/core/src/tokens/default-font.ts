import { fileURLToPath } from 'node:url';
import type { FontSource } from './contract.js';

/**
 * Resolves paths only. No file is read here, so importing core still costs nothing; the
 * buffers load on first render.
 */
const bundled = (file: string): string =>
  fileURLToPath(new URL(`../../fonts/${file}`, import.meta.url));

/**
 * Geist, SIL OFL 1.1, redistributed with its license at `fonts/OFL.txt`.
 *
 * Bundling a typeface is forced rather than chosen: fonts must be real buffers, no network
 * request may ever happen, and `init` must produce an image on first run. Those three cannot
 * all hold unless a font is in the package.
 *
 * Two weights, because this is part of the install-size budget the CI gate measures.
 * `DEFAULT_TYPE` must therefore reference 400 and 700 only. satori substitutes a missing
 * weight silently, so a default config naming a weight that is not here would render a
 * wrong-weight asset with nothing to point at, which is the worst outcome on the failure
 * table. `defaults.test.ts` asserts the two stay consistent.
 */
export const DEFAULT_FONT: FontSource = {
  family: 'Geist',
  files: [
    { path: bundled('Geist-Regular.ttf'), weight: 400, style: 'normal' },
    { path: bundled('Geist-Bold.ttf'), weight: 700, style: 'normal' },
  ],
};
