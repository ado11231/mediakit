/**
 * An Expo app's design tokens as a plain module, which is how React Native projects carry a
 * palette: there is no CSS to read, so the tokens are the source of truth for both the app
 * and anything that generates assets from it.
 */
export const color = {
  brand: {
    500: '#38BDF8',
    600: '#0EA5E9',
  },
  semantic: {
    background: '#0B1220',
    surface: '#131C2E',
    border: '#1E293B',
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
    },
    success: '#22C55E',
    danger: '#F43F5E',
  },
};

export const typography = {
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 16, lineHeight: 24 },
  subhead: { fontSize: 20, lineHeight: 28 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  display: { fontSize: 40, lineHeight: 46, fontWeight: 700 },
};
