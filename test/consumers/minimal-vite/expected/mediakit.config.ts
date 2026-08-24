import { defineConfig } from 'mediakit';

// Colours extracted from src/theme.css by `mediakit init --from`.
// Every GUESS below needs a human decision; the rest name the token they came from.

export default defineConfig({
  tokens: {
    color: {
      accent:   '#1D4ED8', // from primary
      canvas:   '#ffffff', // from bg
      surface:  '#ffffff', // GUESS: the source has no distinct colour left for this; reusing canvas
      ink:      '#1D4ED8', // GUESS: most readable colour on the canvas (primary)
      inkMuted: '#6b7280', // from muted
      positive: '#34D399', // GUESS: no colour in the source could fill this; mediakit's default
      negative: '#F87171', // GUESS: no colour in the source could fill this; mediakit's default
      bezel:    '#1D4ED8', // GUESS: the source has no distinct colour left for this; reusing ink
    },
  },
});
