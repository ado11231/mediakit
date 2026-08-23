# Changelog

Pre-1.0, so breaking changes arrive as minor bumps. Every one gets a migration line, because
the person reading it is you, six months from now, when a project stops building.

## Unreleased

### Fixed

- **`init --from` could emit a config with no `accent`, and could give two roles the same
  colour.** Found by running the extractor across five real repos. A source carrying fewer
  distinct colours than the contract has roles (the Next.js starter's two, `--background` and
  `--foreground`, is the common case) produced `surface` equal to `ink`, a card the colour of
  its text, and `inkMuted` equal to `canvas`, invisible.

  Worse, `accent` came out absent entirely. It is a required field on `TokensInput`, so the
  generated config was a type error in the consumer's project, and at render time it silently
  became mediakit's own blue: somebody else's brand on your screenshot, which is precisely what
  the token contract warns a neutral default cannot fake.

  Two roles may no longer share a value. Where the source runs out, a role borrows from one
  already filled and says so, which keeps the result in-theme and legible; leaving the key out
  instead would hand it to mediakit's dark defaults and clash on a light palette. `accent` has
  no stand-in and is always emitted, flagged. `bezel` now prefers a dark **neutral**, because
  "darkest available" picked a saturated magenta out of a palette whose spare colours were
  chart accents.

### Added

- **`mediakit new`, which writes a complete spec from a template.** `init` scaffolded a
  three-block example that proves the pipeline works and is nothing like the thing anyone came
  for. A five-frame listing was authored by hand, structure and all, and structure is the part
  nobody has an opinion about the first time: a person knows what the frames should say, not
  which layout arranges them. `new` writes the structure and leaves every string a placeholder.

  Templates are a fourth registry, open like the other three, so a project whose carousel always
  opens with a title card registers that shape once. `@mediakit/blocks` ships three:

  - `listing` frames a screen for the App Store and Play
  - `carousel` writes a numbered social carousel
  - `screen` writes a fake app screen from blocks, at device pixels, to frame in a listing

  A template writes a file rather than resolving at render time. A generated spec that gets
  committed and diffed is the "assets as code" promise; a copy file assembled into a spec
  invisibly at render time is a second, hidden source of truth.

  `screen` is the half of a listing that cannot be automated any other way without running the
  app. Composing it from blocks costs exact fidelity and buys what a capture cannot have: it
  re-renders deterministically when a token changes. Capture stays outside core, as a separate
  opt-in package, on the `render-video` precedent.

  **`Registries` gained a `templates` registry and `MediakitConfig` a `templates` field.**
  **Migration:** nothing to change; both are additive and default to empty.

- **A `screen` layout in `@mediakit/blocks`**, a top-anchored column with status-bar headroom.
  `stack` anchors to the end, which is right for a poster and wrong for an app: an app screen
  fills downward from the status bar, and a stacked one reads as a poster of an app.

- **`init --from` now extracts the type scale, the spacing base, and a `scale`.** It read
  colours and fonts and left everything else at mediakit's defaults, which meant a project with
  its own palette still rendered in mediakit's type ratios. Those ratios are the part of a
  design system a reader recognises before they recognise a hue.

  Tailwind v4 hangs `--text-*--line-height`, `--text-*--letter-spacing`, and
  `--text-*--font-weight` off each rung of its ladder, and those modifiers are what make this
  worth parsing: they carry the pairing a designer chose rather than a bare list of sizes. A TS
  token module is read too, for a nested style object or a flat ladder under a type-ish key.

  A ladder is named by size and the token contract is named by role, so there is nothing to
  name-match on. `body` anchors to a named rung, and every other role takes the rung nearest the
  ratio mediakit's own scale uses: your rungs, mediakit's shape. A role with no rung near it is
  marked `GUESS` with the target it was looking for.

  **Every weight is snapped to one the loaded font actually ships.** satori substitutes a
  missing weight silently, so a scale naming a weight the font does not have renders wrong with
  no error at all, which is the worst outcome on the failure table.

  Spacing is usually one number in v4, since the ladder became a base every utility multiplies.
  mediakit's own ladder is that same grid at 1/2/3/4/6/8/10, so a project on the default
  0.25rem extracts to exactly the defaults and nothing is written.

- **`init` proposes a `scale`.** Invariant 11 has always named this as `init`'s job and it had
  never been done: every project inherited a preset's default 2.5 and found out at `check` time
  that its captions sit below the legibility floor. The arithmetic is the one `check` reports
  after the fact, run where it can still be written into a file a human reviews.

  Scoped to the preset being scaffolded, deliberately not to the widest registered one. The
  floor is a fraction of a canvas's own width, so a 2064px tablet needs roughly twice the
  multiplier a 1080px phone does; taking the largest handed a test project `scale: 6.1`. A
  social canvas gets no proposal at all, the same scoping the legibility rule uses.

  Presets carrying a width-proportional scale of their own remains the real fix, and it is a
  breaking change to every consumer's output rather than something to settle inside `init`.

- **`MIN_TEXT_FRACTION` is exported from `@mediakit/core`**, so the rule that reports the
  legibility floor and the scaffolding that proposes a scale to clear it cannot drift apart.

- **A contrast warning on the render path.** The "reads fine on my monitor" class: a muted grey
  on a dark page, or a brand colour on a page tinted with the same brand colour. Both look
  deliberate at desk brightness and disappear on a phone in daylight, and nothing else in the
  pipeline can see it, because the render succeeded and the type is the size it was asked to be.

  Both colours are read back out of the rendered frame rather than out of the tokens, because
  the token pair a rule would guess at is frequently not the pair a reader sees: a `CTA` paints
  its own pill and a card paints its own surface, so what is behind a line of text is whatever
  was painted last under it, not the frame's `canvas`. Where the answer is not one flat colour
  (a gradient, a photo, a translucent layer) the rule says nothing rather than measuring against
  a colour that is nowhere near the text.

  WCAG 2.1 AA at 4.5:1, applied at the strict threshold to text of every size. The standard
  relaxes to 3:1 for large text, where large is defined by the size the reader sees, and a store
  gallery's display width is not published: claiming the exemption would claim a number this
  project has already said it does not have. Warning severity, so the conservative threshold
  costs a line of output rather than a build.

- **An overflow warning on the render path.** satori clips and overflows without complaint. A
  headline one word too long for a `split` column does not throw and does not shrink: yoga
  clamps the box to the column while the glyphs paint straight past it, over whatever sits
  beside them or off the canvas entirely. The render succeeds, the PNG validates, and the word
  is cut in half in the store gallery.

  The rule reads two artifacts from the same render, because neither can see the failure alone:
  the SVG says where the glyphs were actually drawn, and satori's layout pass says which box
  each line was measured into. `RenderedFrame` therefore now carries `textBoxes` beside its
  `svg` and `png`. Nothing about the output changes; the layout callback observes and never
  influences, and the golden files are byte-identical.

  It is horizontal only, deliberately. Vertical bleed is a normal idiom (a device frame running
  off the bottom edge, a list continuing past the fold of the screen it sits in), and flagging
  it would make the rule noise. A line crossing the right edge of its own box, or the side of
  the canvas, is a defect essentially every time.

  Reported by `render`, where the author is looking, and by `export`, which is the last gate
  before an upload. Neither it nor the contrast rule can run in `check`, which does not render
  and so has no geometry and no resolved colours to read. Both arrive through one entry point,
  `checkFrame`, which parses the frame once and runs every rule that reads a rendered frame.
  Warning severity, so neither breaks an existing build on upgrade; `--strict` promotes them as
  it does the legibility rule.

- **A legibility warning in `check`.** A store gallery shows a 1320x2868 screenshot at roughly
  a fifth of full size, so type authored for an app viewport disappears there. The render
  succeeds, the dimensions validate, `check` passed, and it uploaded, which is the exact shape
  of failure this project exists to prevent.

  The threshold is a fraction of canvas width (3.5%) rather than an absolute size, because a
  canvas is only ever viewed scaled and the ratio is what survives that. It is scoped to
  presets that declare channel constraints, and the message names the type token, the resolved
  pixel size, and the `scale` that would fix it.

  It reports at a new **warning** severity: the display width of a store gallery is not
  published, so failing a build on it would claim more certainty than exists, and sharpening a
  heuristic is not a reason to break an existing consumer's pipeline. `check --strict` and
  `export --strict` promote warnings to errors.

- **`mediakit doctor`**, checking the four things that account for most first-run failures:
  Node version, config resolution, whether every declared font file is on disk, and whether the
  loaded weights cover the type scale. It also prints glyph coverage, and the type scale
  resolved as a percentage of canvas width for every listing preset, which is the number
  nothing else in the CLI showed.

### Changed

- **`Violation` gained an optional `severity`.** Absent means an error, so every existing rule
  behaves as before. **Migration:** code that treats any violation as fatal should filter on
  `severity !== 'warning'`.

- **`mediakit init --from <file>`**, extracting a palette from a CSS file (`:root` or Tailwind
  v4's `@theme`) or a TS/JS token module, and finding font files on disk to enumerate weights.

  Every value it writes carries its provenance as a comment in the generated config: `// from
bg-base` where a source token matched by name, `// GUESS: darkest colour found` where nothing
  matched and a stated fallback rule chose. Invariant 11 justifies inference only because a
  human reviews what it wrote, and a reviewer cannot check a hex value without knowing which
  token it came from. The comment survives into the committed file and into code review, where
  terminal output does not.

  Three rules exist because a real palette broke the obvious version of them. Theme darkness is
  decided on the **median** luminance, not the lightest colour, since a dark palette still
  carries a near-white text colour and the extremes answer the same for both themes. `accent`
  is the most **saturated** unclaimed colour rather than the first, because a design system
  that names its gold `champagne` and its background `obsidian` gave an accent identical to the
  canvas. And `bezel` is explicitly forbidden from equalling `canvas`, which is the
  phone-shaped-hole trap already recorded against the default token set.

  A discovered font family is used only if it covers every weight `DEFAULT_TYPE` names.
  `loadFonts` throws on a missing weight, so a family shipping only 500 and 600 would scaffold
  a config that cannot render, and `init` must leave a project in a state `render` consumes
  immediately.

- **`mediakit init --preset <name>`**, so a project scaffolds its example spec at a store size
  rather than always at `ig-portrait`.

- **`mediakit schema`**, printing the spec vocabulary derived from the project's registries:
  every preset with its constraints, every layout with its slots, every block with its props,
  and the registered colour tokens. `--format json` emits JSON Schema for a structured-output
  API; `--format md` emits the same vocabulary as prose for a prompt or a person, from one
  registry walk so the two cannot describe different products.

  This is invariant 5, which had no implementation. The reference kept a hand-edited
  `REGISTRY_CATALOG`, so registering a custom block taught the generator nothing. A block,
  layout, preset, or colour token registered in a config now reaches the output on the next run
  with no further work, and a test asserts exactly that.

  Slots are one frame variant per layout rather than every slot name unioned, since `assertSlot`
  throws in both directions. Verified with a real JSON Schema validator: all five of the
  example's specs validate, and unknown block types, unknown presets, unknown colour tokens,
  missing required props, an uppercase id, a slot on a slotless layout, and a wrong slot name on
  `split` are each rejected. Uses zod 4's native `toJSONSchema`, so no new dependency; a schema
  with no JSON Schema form still appears, without its prop detail, rather than failing the
  command.

- **Glyph coverage in `check`.** Every string in every block is checked codepoint by codepoint
  against the `cmap` of the loaded fonts. A missing glyph is the same failure as a missing font
  weight one level down: satori substitutes silently, so an emoji or a CJK character renders as
  a blank or a tofu box, `check` passed, and the asset uploaded. The bundled Geist covers 726
  codepoints, so `"Ship it 🎉"` was previously a silent tofu box.

  Parsed with `node:buffer` alone, no new dependency: formats 0, 4, 6, and 12, unioned across
  every Unicode subtable, with a codepoint mapped to glyph 0 counted as missing since `.notdef`
  is the tofu box itself. A font this parser cannot read reports nothing at all, because a
  parser limitation must never produce a violation against a font that is in fact complete.

  It walks every prop rather than a list of text-bearing block types, which is the choice
  `checkBrandRules` already makes: a custom block's text is checked without core knowing the
  block by name. The cost is that a non-Latin character in a prop that is never drawn, a
  `DeviceFrame` src path for instance, is reported too. That direction is the safe one.

  `export` runs the same spec rules, so a bundle whose text cannot be drawn is refused before
  anything reaches disk.

- **`mediakit export <spec>`**, which writes the folder an upload form expects: one directory
  per preset, frames named `<spec-id>-NN.png` so upload order follows the filename sort, and a
  `manifest.json` carrying the dimensions, a SHA-256 per frame, and the constraints verified.

  It renders rather than reading `marketing/`, so a stale PNG cannot be exported and the bytes
  match `render`'s exactly. Every spec and asset rule runs before anything reaches disk, so a
  bundle that exists is a bundle that passed. The manifest carries no timestamp and no version
  string, because either would change the bundle's bytes while the spec did not.

  Channel packs (`@mediakit/channels`) layer on as a `--channel` flag later. They are not a
  prerequisite: presets already carry the constraints.

- **`mediakit presets`**, listing every registered preset with its dimensions and constraints.
  The registry already knew; there was no way to see it without reading source. It is the one
  command that works with no config present, and a preset from your own config is labelled
  `custom`, which is the only confirmation that a registration took effect short of rendering.

- **A no-watermark test, so invariant 12 is enforced rather than claimed.** A single
  `Background` block at a known colour is rendered at every registered preset, the IDAT is
  inflated with `node:zlib`, and every pixel is asserted to equal that colour. Verified against
  a deliberately injected 4x4 mark, which all 13 presets caught.

  A golden-file test cannot cover this: a mark introduced before the goldens were written would
  be baked into them and compare equal forever. The preset list comes from the registry, so
  registering a preset without covering it is not possible.

- **`render` and `export` close with a summary** naming the frame count, preset count, total
  bytes, and directory, and `render` names the next command. Colour comes from `node:util`'s
  `styleText` and is suppressed under `NO_COLOR` or a non-TTY stream.

### Fixed

- **Render and CLI tests could fail as timeouts under parallel load.** Two rendering tests had
  no explicit timeout at all and relied on vitest's 5s default, against a rasterization that
  takes 2 to 5 seconds when the machine is idle. Turbo runs each package's suite concurrently,
  so a loaded machine turned correct code into a red CI run reporting "timeout".

  The 34 inline per-test timeouts that were the previous answer are replaced by one shared
  floor in `vitest.shared.ts`, because the number that passes on a developer machine is not the
  number that passes on a loaded runner. A timeout here exists to stop a hang; the golden-file
  byte comparison is what polices render output.

### Changed

- **README images no longer link at example fixtures.** The store pair is one cropped
  composite spec (`store-pair`): both listings on a `field` colour pulled from the example's
  accent. The carousel is a single GIF rendered through the light config. Display copies live
  in `docs/assets/` at 2x the README width, so a fixture change cannot silently rewrite the
  page, and an `ios-6.9` frame cannot render at full container height.
  `pnpm render-readme-assets` still gates drift in CI.

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
