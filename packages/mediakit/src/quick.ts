export const quickConfig = `import { defineConfig } from 'mediakit';

export default defineConfig({
  outDir: 'dist/marketing',

  // Add your actual font files at these paths, or change the paths below.
  fonts: {
    brand: [
      { path: 'marketing/fonts/Brand-Regular.ttf', weight: 400 },
      { path: 'marketing/fonts/Brand-Bold.ttf', weight: 700 },
    ],
  },

  // Editable starter values, not values discovered from your app.
  design: {
    background: '#ffffff',
    text: '#111111',
    secondaryText: '#555555',
    padding: 64,
    gap: 24,
    headline: { font: 'brand', size: 64, weight: 700, lineHeight: 76 },
    body: { font: 'brand', size: 30, weight: 400, lineHeight: 40 },
  },

  // Add dashboard.png, then uncomment this screen and the screenshot slide below.
  screens: {
    // dashboard: { type: 'image', path: 'marketing/screens/dashboard.png' },
  },

  // Each destination can have its own typography and spacing.
  outputs: {
    'app-store-iphone': {
      design: {
        padding: 96,
        headline: { size: 96, lineHeight: 112 },
        body: { size: 40, lineHeight: 52 },
      },
    },
  },

  campaign: {
    id: 'launch',
    outputs: ['instagram-portrait'], // Add 'app-store-iphone' or 'linkedin-document'.
    slides: [
      {
        layout: 'text-only',
        headline: 'Your next big idea.',
        body: 'Write your message here.',
        align: 'left',
        // Override any shared font, size, weight, or color for this slide.
        design: { headline: { size: 72, lineHeight: 84 } },
        // Optional exact boxes in output pixels, measured from the top-left.
        // Remove positions to use automatic layout. Keep text inside its box.
        positions: {
          headline: { x: 64, y: 180, width: 952, height: 240 },
          body: { x: 64, y: 460, width: 952, height: 160 },
        },
      },
      // {
      //   layout: 'headline-above-device',
      //   headline: 'Your app, at its best.',
      //   body: 'Show people what they can do.',
      //   screen: 'dashboard',
      //   device: 'iphone',
      //   // Optional: set positions.screen to { x, y, width, height, rotation }.
      // },
    ],
  },
});
`;
