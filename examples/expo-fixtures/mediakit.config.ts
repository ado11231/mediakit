import { defineConfig } from 'mediakit';

export default defineConfig({
  sources: { app: { type: 'module', path: 'theme.ts', export: 'theme' } },
  fonts: {
    brand: [
      { path: '../source-app/fonts/Geist-Regular.ttf', weight: 400 },
      { path: '../source-app/fonts/Geist-Bold.ttf', weight: 700 },
    ],
  },
  design: {
    background: { source: 'app', token: 'background' },
    text: { source: 'app', token: 'text' },
    secondaryText: { source: 'app', token: 'secondaryText' },
    padding: 96,
    gap: 42,
    headline: { font: 'brand', size: 108, weight: 700, lineHeight: 120 },
    body: { font: 'brand', size: 44, weight: 400, lineHeight: 58 },
  },
  screens: { dashboard: { type: 'ios', target: 'app', scene: 'dashboard' } },
  capture: {
    app: {
      type: 'ios',
      appId: 'dev.daybook.mediakit',
      scheme: 'daybook-fixtures',
      simulator: 'iPhone 17 Pro',
    },
  },
});
