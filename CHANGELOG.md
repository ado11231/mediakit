# Changelog

Pre-1.0, so breaking changes arrive as minor bumps. Every one gets a migration line, because
the person reading it is you, six months from now, when a project stops building.

## Unreleased

### Changed

- **`chrome: "phone"` no longer draws a notch.** It framed every screenshot with a drawn pill,
  including the case the README calls the headline one: a real capture from a device or
  simulator, which already contains the status bar and the Dynamic Island. The result was two
  stacked islands, offset from each other because the drawn one sat flush against the screen's
  top edge while the real one is inset. Nothing reported it. The render succeeded, the
  dimensions validated, `check` passed, and the asset was uploadable.

  `phone` is now bezel only, which is correct for a capture. The drawn island moved to the new
  `phone-notch`, for screen content that genuinely has no status bar because it was composed
  from blocks rather than captured. Which one applies is a property of how the image was
  produced, so it stays an authoring decision: a render that sniffed the pixels would be
  inference in the render path, which is invariant 11.

  **Migration:** if your `DeviceFrame` src is a real screenshot, change nothing, and re-render
  to drop the doubled island. If it is an app screen mediakit rendered for you, change
  `"chrome": "phone"` to `"chrome": "phone-notch"`. `examples/source-app` is the second case and
  shows the change.

### Added

- **`phone-notch` device chrome**, with the island sized from Apple's published geometry:
  125x36pt inset 14pt from the top edge of a 440pt-wide 6.9-inch display, expressed as fractions
  of screen width so it tracks the bezel at any render size. The previous pill was too wide, too
  short, and flush to the edge, which read as an older device's notch rather than an island.
- **`color.bezel` token**, defaulting to `#0B0E14`. The device shell colour was a hex literal
  inside the frame, which is invariant 9. It cannot fall back to `canvas`: a consumer with a
  light page would render a light bezel and the device would disappear into the background. A
  silver or white phone is now a token override rather than a fork of the frame.
- **`--config <path>` on `render`, `check`, and `preview`.** The config was found only by looking
  in cwd, so a project rendering the same tokens at two scales needed one directory per config,
  each dragging its own `specs/` and output tree along, and every script had to `cd` into one.
  Naming the config instead lets a single directory hold several. Spec-relative paths still
  resolve against cwd, so a `DeviceFrame` src means the same thing whichever config renders it;
  build font paths from `import.meta.dirname` rather than leaving them relative.
- **`@mediakit/blocks/frame/*` deep imports**, covering `none`, `phone`, and `phone-notch`.
  Frames were reachable only through `./defaults`, so a consumer wanting `phone` alone had to
  pull in every built-in block to get it. Layouts and blocks already had this and frames were
  the gap. The bezel geometry the two phone frames share lives outside `frames/` precisely
  because that directory is published wholesale, and a shared helper is not a promise worth
  making.

### Fixed

- **Builds left deleted files behind in `dist`, and `files: ["dist"]` shipped them.** `tsc` does
  not clear its output directory, so a renamed or removed source file kept its compiled artifact
  in every subsequent tarball. With a wildcard export like `./frame/*` that is not cosmetic: a
  module moved out of the directory stayed importable from the published package anyway. Every
  package now clears `dist` before compiling.
- **The committed README assets were stale.** `Stat`'s fix below changed what
  `examples/source-app/marketing/app-screen/frame-01.png` renders, and the assets were not
  regenerated, so `pnpm render-readme-assets` had been failing since that commit and the store
  image in the README showed the pre-fix `Stat`. Regenerated.
- **`Stat` uppercased the value, rewriting the spec author's copy.** `textTransform:
'uppercase'` was hardcoded past the token spread on both the value and the label, so a spec
  saying `"value": "5 min"` rendered `5 MIN` and no token or prop could turn it off. That is a
  content change wearing a styling change's clothes: a price, a version string, or a product
  name shipped altered with no error and no diff to point at. The value now defaults to
  `transform: 'none'` and takes `'uppercase'` on request; the label keeps its uppercase default
  through the new `labelTransform` prop, so the stats-tile look is unchanged.
  **Migration:** add `"transform": "uppercase"` to any `Stat` whose value you wanted in caps.
  Values that are digits or already capitalised (`3.2x`, `10K`) render identically and need
  nothing. Re-render any asset containing a `Stat` with lowercase letters in its value.
- **`Stat` and `CTA` pinned style values the token contract owns.** `Stat` forced
  `letterSpacing` on both lines and `CTA` forced `fontWeight: 700`, each overriding the `type`
  token the block had just read, which is invariant 9 in `CLAUDE.md`. Both now defer to the
  token. **Migration:** with the default tokens, `CTA` is unchanged, because `callout` is
  already 700. A config whose `callout` or `display` carries a different weight or tracking
  will see those blocks change to match it, which is the intent. Set the token, not the prop.

Neither block appears in the golden fixture, so no golden file changed. Found by rendering a
real app's specs, where `"5 min"` came back as `5 MIN`; every fixture at the time used all-caps
or digit-only values, so the whole suite passed over it.

## 0.1.0 - 2026-08-07

### Fixed

- **`mediakit check` exited 0 while reporting violations.** The bin resolved the command's exit
  code and discarded it, so every non-zero return from `check`, `render`, `preview`, and `init`
  exited 0. Any CI job gated on `check` was passing unconditionally. Re-run your pipeline: it
  may have been green on assets a store would reject.
- **`check` ignored blocks, layouts, and presets registered in `mediakit.config.ts`.** A spec
  naming a custom preset failed as unregistered under `check` while rendering fine under
  `render`.
- **Presets declaring `noAlpha` now emit 24-bit PNGs.** resvg encodes colour type 6 regardless
  of whether any pixel is transparent, and Apple and Google reject on the channel being present.
  Rendered output for `ios-6.9`, `ios-6.5`, `ipad-13`, and `play-feature` would have been
  rejected at upload. **Migration:** re-render any listing assets produced before this release.
  Golden files for those four presets changed; nothing else did.
- **`check` rejected sizes the channel actually accepts.** `play-phone` now accepts any size
  from 320 to 3840 per side under the 2:1 ceiling, and `cws-screenshot` accepts 640x400 as well
  as 1280x800, matching Google's and Chrome Web Store's documented rules. Apple stays exact.
- **`preview` truncated multi-line errors.** Server-sent events framed a multi-line payload
  without prefixing each line, so an unknown-preset error lost the list of registered presets.
- **`preview`'s error overlay showed `undefined` on disconnect.** The server's error event
  shared a name with EventSource's native one, which carries no payload. Renamed to
  `render-error`.
- **`checkSpec` silently passed an unregistered preset.** It now reports one, listing what is
  registered.

### Changed

- **`render --preset X` no longer nests output under the preset for a single-preset spec.**
  Output layout is a property of the spec, not of the flags on the invocation, which is what
  `design.md` always specified. `check` looked in the un-nested path and reported freshly
  written output as missing. **Migration:** if you relied on the nested path for a single-preset
  spec, the files now land at `marketing/<spec-id>/frame-NN.png`.
- **`Constraint` gained `altSizes` and `sizeRange`.** Additive; existing presets are unaffected.

### Added

- **`mediakit`, the package a consumer installs.** A thin facade that owns the `mediakit` bin
  (delegating to `@mediakit/cli`) and re-exports `@mediakit/core`'s config-authoring API, so
  `npm i -D mediakit` resolves rather than 404s. `init` now scaffolds a config that imports
  `defineConfig` from `mediakit`, because pnpm's strict layout will not resolve `@mediakit/core`
  by name for a consumer who installed only `mediakit`. Settles roadmap decision 1.
- **Pack-based external-consumer smoke test (`pnpm pack-smoke`), gated in CI.** Packs every
  publishable package as a consumer receives it, installs the tarballs into a throwaway project,
  and runs init, render, and check. Catches a broken `exports` map, a missing `dist`, or an
  absent bin shebang, none of which typecheck or the workspace tests can see.
- **The repo renders its own README (`pnpm render-readme-assets`), gated in CI.** The README
  embeds the launch still and the `ios-6.9` store listing, regenerated from their committed
  specs and failing on any drift.
- Install-size and dependency-count budget enforced in CI (`pnpm budget`). Currently 18.3 MB
  across 30 packages.
- `examples/source-app` renders and checks store assets at `ios-6.9` and `play-phone`, composing
  a rendered app screen inside a `DeviceFrame`. This is the test that caught the alpha-channel
  bug above.

### Removed

- `spike/`, the M0 satori spike. Recoverable at `git show 06ff919`.
