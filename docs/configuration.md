# Configuration and sizing

Paths resolve relative to mediakit.config.ts (or .mts in a CommonJS project). Campaigns can
import other local modules. Preview reloads those imports after edits.

`campaign` accepts either a file path or an inline object containing `id`, `outputs`, and
`slides`. Use `mediakit init --quick` for an editable single-file template with copy, typography,
and positioning examples. See [quick start](quick-start.md).

```ts
import { defineConfig } from 'mediakit';

export default defineConfig({
  campaign: 'marketing/campaign.ts',
  outDir: 'dist/marketing',
  sources: {
    app: { type: 'css', path: 'app/globals.css', selector: ':root' },
    native: { type: 'module', path: 'theme/tokens.ts', export: 'theme' },
  },
  fonts: {
    brand: [
      { path: 'assets/fonts/Brand-Regular.ttf', weight: 400 },
      { path: 'assets/fonts/Brand-Bold.ttf', weight: 700 },
    ],
  },
  design: {
    background: { source: 'app', token: '--background' },
    text: { source: 'app', token: '--foreground' },
    secondaryText: { source: 'native', token: 'color.muted' },
    padding: 80,
    gap: 32,
    headline: { font: 'brand', size: 80, weight: 700, lineHeight: 92 },
    body: { font: 'brand', size: 36, weight: 400, lineHeight: 48 },
  },
  outputs: {
    'app-store-iphone': {
      design: { headline: { size: 108, lineHeight: 120 }, padding: 96 },
    },
    'wide-card': { width: 1600, height: 900, format: 'png' },
    document: { width: 1080, height: 1350, format: 'pdf' },
  },
});
```

## Required values

Every slide requires background, text, padding, and headline typography. Body copy also
requires secondaryText, body typography, and gap. A screen also requires gap. Typography
requires a font name, size, weight, and lineHeight. Letter spacing defaults to normal (0).
Fonts are local TTF, OTF, WOFF, or WOFF2 files. Font collections are unsupported.

Sizes, line heights, letter spacing, and placement use output pixels. They may be literal
numbers or explicit source mappings. CSS length mappings resolve through Chromium, including
rem units. Marketing typography is separate from the small text inside the captured app.

No font substitutions, automatic font size reductions, generated palettes, or default brand
colors are used. A missing glyph or font weight is an error. The background must be opaque.

Configuration is merged in this order: base design, output design, slide design, slide output
override. Typography fields merge individually. Position overrides merge by element.

## CSS and theme sources

Discovery lists candidate sources and token names in marketing/design-sources.json. It does
not assign semantic roles. Font filename discovery does not claim to identify weights.

CSS sources support local quoted imports, CSS variables and aliases, and Tailwind `@theme`
declarations. Theme selectors support `:root`, `html`, a single `.class`, or an attribute such
as `[data-theme=dark]`. Set `mode: 'dark'` for dark media queries. Imported theme declarations
retain their selector context.

Mediakit is not a Tailwind compiler. Map a compiled stylesheet if your values require plugins,
conditional imports, utility application, complex selectors, or package imports other than
`tailwindcss`. CSS URLs are blocked during token resolution. Fonts are loaded separately from
your explicit font configuration.

Module sources name their export and a dotted token path. Tailwind v3 objects can be mapped
through paths such as `theme.extend.colors.brand`. These are trusted local build-time modules;
do not point them at an application bootstrap with database side effects.

## Copy and placement

```ts
{
  layout: 'text-beside-device',
  headline: 'Write the message here.',
  body: 'Keep the supporting copy here.',
  screen: 'dashboard',
  device: 'iphone',
  bezel: 'silver',
  align: 'left',
  outputs: {
    'wide-card': {
      design: { headline: { size: 72, lineHeight: 84 } },
      positions: {
        headline: { x: 80, y: 100, width: 640, height: 240 },
        screen: { x: 900, y: 70, width: 480, height: 760, rotation: 4 },
      },
    },
  },
}
```

Layouts adapt to available space without stretching the capture. Position boxes are measured
from the output's upper-left corner. Rotation is in degrees around the box center. Text that
exceeds a box or canvas blocks rendering. Use explicit overrides when aspect ratios need a
different arrangement. Typoed or unused output overrides fail validation.

`crop: { x, y, width, height }` explicitly selects a rectangle in source-image pixels before
composition. It must remain inside the source. Without a crop, the full image is preserved
apart from the selected phone's rounded corner mask. `device: 'none'` preserves square edges.
The phone adds a bezel only, never an extra status bar or island.

## Outputs and validation

Built-in dimensions and slide count limits cannot be overridden. Use a different custom name
for custom dimensions. App Store presets allow 1 to 10 slides; Google Play phone allows 2 to 8.
Social presets provide common canvas sizes, not an assurance of content eligibility.

- Apple dimensions: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Apple upload counts: https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots
- Google Play: https://support.google.com/googleplay/android-developer/answer/9866151
- LinkedIn documents: https://www.linkedin.com/help/linkedin/answer/a523054/document-uploads-on-linkedin-faq

PNG output is opaque RGB at the configured pixel dimensions. PDF pages use the same layout
with embedded fonts and vector text; their point dimensions equal pixel dimensions × 72/96.
Preview shows each PDF page's corresponding PNG. PDFs have a 100 MB export limit.

`check` runs the same capture and render validations as export without writing a bundle.
`preview` can show successful outputs alongside diagnostics for incomplete outputs. Export
publishes nothing unless every requested output passes. The previous successful output remains
available after validation failure. A manifest records hashes, resolved design, and environment.

Mediakit replaces only its own marked export directory. It rejects project-root output paths
and paths containing configured inputs. Do not put unrelated files inside the export directory.
