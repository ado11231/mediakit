import { defineConfig } from 'mediakit';
import { join } from 'node:path';

const here = import.meta.dirname;

// Colours extracted from app/globals.css by `mediakit init --from`.
// Every GUESS below needs a human decision; the rest name the token they came from.

// Font paths are resolved from this file's own directory, so the config survives being
// committed and checked out somewhere else. They stay explicit either way: mediakit never
// resolves fonts from node_modules and never fetches them, because a render that depends on a
// network response is not reproducible.
const sans = {
  family: 'BrandSans',
  files: [
    { path: join(here, 'fonts/BrandSans-Regular.ttf'), weight: 400, style: 'normal' },
    { path: join(here, 'fonts/BrandSans-Bold.ttf'), weight: 700, style: 'normal' },
  ],
};

export default defineConfig({
  tokens: {
    color: {
      accent:   '#6d28d9', // from primary
      canvas:   '#ffffff', // from background
      surface:  '#f8fafc', // from surface
      ink:      '#0f172a', // from foreground
      inkMuted: '#a78bfa', // GUESS: mid-luminance colour found (ring)
      positive: '#15803d', // from success
      negative: '#b91c1c', // from destructive
      bezel:    '#e2e8f0', // GUESS: darkest neutral that is not the canvas; a bezel must contrast it (border)
    },
    font: {
      display: sans,
      body: sans,
    },
    type: {
      display: { fontSize: 36, fontWeight: 700, lineHeight: 1.11, letterSpacing: '-0.03em' }, // from text-4xl
      title: { fontSize: 24, fontWeight: 700, lineHeight: 1.33, letterSpacing: '-0.02em' }, // from text-2xl
      headline: { fontSize: 24, fontWeight: 700, lineHeight: 1.33 }, // from text-2xl
      body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 }, // from text-base
      callout: { fontSize: 14, fontWeight: 700, lineHeight: 1.43 }, // from text-sm
      caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.33, letterSpacing: '0.02em' }, // from text-xs
    },
    // Spacing from --spacing, a 8px base on mediakit's 1/2/3/4/6/8/10 grid.
    space: {
      xs: 8,
      sm: 16,
      md: 24,
      lg: 32,
      xl: 48,
      '2xl': 64,
      '3xl': 80,
    },
    scale: 3.9, // GUESS: type.caption at 12px must clear 3.5% of ios-6.9's 1320px width to stay readable in a store gallery
  },
});
