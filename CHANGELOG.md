# Changelog

Pre-1.0, so breaking changes arrive as minor bumps. Every one gets a migration line, because
the person reading it is you, six months from now, when a project stops building.

## Unreleased

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

- Install-size and dependency-count budget enforced in CI (`pnpm budget`). Currently 18.3 MB
  across 29 packages.
- `examples/source-app` renders and checks store assets at `ios-6.9` and `play-phone`, composing
  a rendered app screen inside a `DeviceFrame`. This is the test that caught the alpha-channel
  bug above.

### Removed

- `spike/`, the M0 satori spike. Recoverable at `git show 06ff919`.
