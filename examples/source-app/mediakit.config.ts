import { defineConfig } from 'mediakit';

export default defineConfig({
  sources: { app: { type: 'css', path: 'app/globals.css' } },
  fonts: {
    brand: [
      { path: 'fonts/Geist-Regular.ttf', weight: 400 },
      { path: 'fonts/Geist-Bold.ttf', weight: 700 },
    ],
  },
  design: {
    background: { source: 'app', token: '--background' },
    text: { source: 'app', token: '--foreground' },
    secondaryText: { source: 'app', token: '--muted' },
    padding: { source: 'app', token: '--marketing-padding' },
    gap: { source: 'app', token: '--marketing-gap' },
    headline: { font: 'brand', size: 72, weight: 700, lineHeight: 84 },
    body: { font: 'brand', size: 34, weight: 400, lineHeight: 46 },
  },
  outputs: {
    'app-store-iphone': {
      design: {
        headline: { size: 108, lineHeight: 120 },
        body: { size: 44, lineHeight: 58 },
        padding: 96,
        gap: 42,
      },
    },
    'readme-card': {
      width: 600,
      height: 900,
      design: {
        headline: { size: 46, lineHeight: 54 },
        body: { size: 22, lineHeight: 30 },
        padding: 36,
        gap: 24,
      },
    },
  },
  screens: {
    dashboard: {
      type: 'web',
      target: 'app',
      scene: 'dashboard',
      width: 390,
      height: 844,
      scale: 3,
    },
  },
  capture: {
    app: {
      type: 'web',
      url: 'http://127.0.0.1:4311',
      command: ['node', 'fixtures/server.mjs'],
    },
  },
});
