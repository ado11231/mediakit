import { defineConfig } from 'mediakit';

// Colours extracted from theme/tokens.ts by `mediakit init --from`.
// Every GUESS below needs a human decision; the rest name the token they came from.

export default defineConfig({
  tokens: {
    color: {
      accent:   '#38BDF8', // from color.brand.500
      canvas:   '#0B1220', // from color.semantic.background
      surface:  '#131C2E', // from color.semantic.surface
      ink:      '#F8FAFC', // from color.semantic.text.primary
      inkMuted: '#94A3B8', // from color.semantic.text.secondary
      positive: '#22C55E', // from color.semantic.success
      negative: '#F43F5E', // from color.semantic.danger
      bezel:    '#F8FAFC', // GUESS: the source has no distinct colour left for this; reusing ink
    },
    type: {
      display: { fontSize: 28, fontWeight: 700, lineHeight: 1.21, letterSpacing: '-0.03em' }, // from typography.headline
      title: { fontSize: 28, fontWeight: 700, lineHeight: 1.21, letterSpacing: '-0.02em' }, // from typography.headline
      headline: { fontSize: 20, fontWeight: 700, lineHeight: 1.4 }, // from typography.subhead
      body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 }, // from typography.body
      callout: { fontSize: 16, fontWeight: 700, lineHeight: 1.5 }, // from typography.body
      caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.33, letterSpacing: '0.02em' }, // from typography.caption
    },
    scale: 3.8, // GUESS: type.caption at 12px must clear 3.5% of ios-6.5's 1284px width to stay readable in a store gallery
  },
});
