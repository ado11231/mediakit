# Create images from one file

Requirements: Node.js 22 or newer, local font files, and optional screenshots. Chromium is
installed by init if missing. Existing images need no running app, database, or simulator.

```bash
npm install -D mediakit
npx mediakit init --quick
```

This creates `mediakit.config.ts` (`.mts` in a CommonJS project), `marketing/fonts`, and
`marketing/screens`. Existing configuration is preserved. All copy and design choices live
in the config; there is no separate campaign file. The regular `init` workflow still works.

## Fill in the template

1. Put your regular and bold font files in `marketing/fonts/Brand-Regular.ttf` and
   `marketing/fonts/Brand-Bold.ttf`, or edit the paths and weights in `fonts`.
2. Edit the example colors and typography under `design`.
3. Edit `campaign.slides`: each item is one image or document page. Duplicate a slide to add more.
4. To include a screenshot, add `marketing/screens/dashboard.png`, then uncomment the
   `screens.dashboard` entry and screenshot slide. Register more images under other screen names.
5. Set `campaign.outputs`, for example `['instagram-portrait', 'app-store-iphone']`.

```bash
npx mediakit preview
```

Open http://127.0.0.1:4310. Save the config to refresh the images. Stop preview with Ctrl+C.

```bash
npx mediakit export
```

Images are written to `dist/marketing/<destination>/01.png`, `02.png`, and so on. A
`linkedin-document` output writes a multipage PDF. `manifest.json` records the build inputs
and outputs. `npx mediakit check` runs validation without writing a bundle.

## Control text and placement

`headline` and `body` are marketing text added by Mediakit. Text already inside a screenshot
must be changed in the source app or image. Shared styles go in `design`; individual slides
can override them:

```ts
{
  layout: 'headline-above-device',
  headline: 'Your app, at its best.',
  body: 'Show people what they can do.',
  screen: 'dashboard',
  device: 'iphone',
  align: 'left',
  design: {
    text: '#182234',
    headline: { font: 'brand', size: 72, weight: 700, lineHeight: 84 },
    body: { size: 32, lineHeight: 44 },
  },
  positions: {
    headline: { x: 64, y: 64, width: 952, height: 180 },
    body: { x: 64, y: 268, width: 952, height: 100 },
    screen: { x: 280, y: 410, width: 520, height: 840, rotation: 0 },
  },
}
```

These boxes target a 1080 x 1350 canvas. `x` moves right, `y` moves down, and width/height
set the available space, all in output pixels. Remove `positions` for automatic layout.
Different canvas shapes can need different boxes. Use a slide's `outputs` for those changes:

```ts
outputs: {
  'app-store-iphone': {
    design: { headline: { size: 96, lineHeight: 112 } },
    positions: {
      headline: { x: 96, y: 120, width: 1128, height: 260 },
      body: { x: 96, y: 420, width: 1128, height: 160 },
      screen: { x: 160, y: 660, width: 1000, height: 2080 },
    },
  },
}
```

Fonts must include every weight used. Text that does not fit must be shortened, given more
space, or assigned a smaller font size. Screenshots must have enough pixels for their displayed
size. Preview reports these issues; export keeps the previous successful bundle if validation fails.

Automatic web or iOS capture can be added later through the same `screens` and `capture`
configuration. See [fixture setup](fixtures.md). An inline `campaign` supports the same layouts,
overrides, and validation as a separate campaign file.
