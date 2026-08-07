# Roadmap

## Milestones

| #      | scope                                                                                      | gate / definition of done                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | **satori spike.** Build `DeviceFrame` and the `split` layout from scratch in satori        | **go / no-go for the entire plan**                                                                                                     |
| M1     | `core`, `blocks`, `render-still`, social presets, **token contract**, **registration API** | the source app's carousels render from mediakit, with a custom **block, layout, and preset** all registered from `examples/source-app` |
| M2     | listing presets (mobile and web), `DeviceFrame`, `check`                                   | the source app's store assets generated end to end, and at least one web preset proving the surface is not mobile-only                 |
| M3     | token extraction as `init`-time codegen, preview UI, registry-derived LLM vocabulary       | a **second** app works, with different tokens, fonts, and blocks. Your own next project counts and is the easiest way to run this gate |
| M4     | `render-video`, opt-in                                                                     | Reels and App Preview output, passing Apple's constraints                                                                              |

**Publish at M2**, with both differentiators already shipped.

### Why the token contract and block API are in M1

M1's gate is "the source app's carousels render from mediakit." Those carousels use `JobCard`,
`HeroCard`, `StatusChip`, and `PhoneMockup` wrapping app screens. All of them are
source-app-specific and none are shippable as built-in blocks, so they must live in
`examples/source-app`, which means **M1 cannot be met without the extension API.**

This is good news rather than a cost. The API that lets you register `JobCard` is the identical
API a stranger uses to register `PricingCard`. You cannot fake dogfooding it and you cannot
defer it. Only token _extraction_ (Tailwind, Style Dictionary) stays at M3.

Publishing at M2 without the token contract would mean launching into the one crowded category
as the eighth App-Store-only package, with the actual wedge unshipped, while `@appmockup/cli`
is a month old and iterating.

---

## M0 in detail, the only thing that can invalidate this plan

satori implements a **CSS subset**: flexbox yes, CSS grid no, limited filters and transforms.
The question M0 answers is whether the hardest layout survives that subset. Nothing else.

### M0 is a rewrite, not a port

Decided 31 July 2026. An earlier draft defined M0 as porting `PhoneMockup` and `split` out of
`carousels/` and diffing the result. That is the wrong shape of work, for three reasons:

1. **The carousels code is Remotion-shaped.** `AbsoluteFill`, `delayRender`, `staticFile`, and
   browser `FontFace` loading have no satori equivalent. A port here is a rewrite with the old
   file open, and the generic blocks are trivial flexbox anyway.
2. **It violates most of the invariants it would be ported into.** Hardcoded `1080` in the
   schema, `REGISTRY_CATALOG`, `noExclamation` baked into a refinement, `props.text as string`
   eleven times, app-specific blocks beside generic ones. Porting means carrying all of it
   forward and then undoing it.
3. **A pixel diff against Chrome was never a usable gate anyway.** Different text shapers and
   rasterizers cannot agree, which the pass criteria below already conceded.

`carousels/` is therefore a **design reference and nothing else**: no import, no workspace link,
no path dependency, in either direction. What transfers is knowledge, roughly two screens of it.
The type scale ratios, the phone geometry (280x570, radius 40, bezel 9, notch 90x24), the layout
taxonomy, the block vocabulary, and the best idea in that codebase, which is the schema acting
as a leash on the LLM.

### Prerequisite: the reference output, completed 31 July 2026

The reference renderer had never produced a usable baseline. Verified by running it:

**Working.** Remotion renders, fonts load from disk, `@source-app/ui` tokens resolve, the
`centered` layout is correct, letter-spacing and uppercase transforms are correct, output is
exactly 1080x1350, `tsc --noEmit` is clean, and the schema tests pass. Install is fast (246
packages, 7s) and a full 5-slide export takes 16s including the one-time 93.5MB Chrome
download.

**One real bug, now fixed.** Every slide rendered as slide 1. Remotion serializes props down two
separate channels (`render-still.js:360` and `:377`): `inputProps` becomes
`serializedInputPropsWithCustomSchema`, while `composition.props` becomes
`serializedResolvedPropsWithCustomSchema`, and the component renders from the **resolved** one.
`scripts/export.ts:30` called `selectComposition` once with `slideIndex: 0`, freezing
`composition.props`. The per-slide `inputProps` went down the channel that does not render, so
`CarouselSlide` received `slideIndex: 0` every time. Five correctly named, byte-identical files,
confirmed by md5. Fixed by overriding the resolved props per iteration:

```ts
composition: { ...composition, props: { spec, slideIndex: i } }
```

Re-exported: five distinct hashes, with `slide-01` byte-identical to its previous render, which
confirms the fix changed only slides 2 through 5 rather than shifting rendering globally.

Nothing in the pipeline could have caught this: exit code 0, five correctly named files, correct
dimensions, no warnings, and console output announcing slides it was not writing. This is the
argument for the golden-file rule in `CLAUDE.md`, and specifically for the distinctness
assertion added there.

**One cold-start gap, which is not a bug.** `scripts/export.ts:14` resolves specs from
`specs/<id>.json`, and `scripts/generate.ts:109` writes exactly there, so the wiring is correct.
But `carousels/.gitignore:3` ignores `specs/*.json`, and the only committed spec lives at
`src/spec/examples/hvac-lead-loss.json`. A fresh clone therefore cannot render anything without
either an LLM API key for `generate` or a manual copy. The resulting requirement on
`mediakit init` is recorded in `design.md`.

### What the never-before-rendered slides showed

Slide 2 is the `split` layout with `PhoneMockup` wrapping `LeadsScreen`, the exact case M0
exists to de-risk, and until 31 July 2026 it had never been rendered by anything.

**It renders correctly.** Phone frame, bezel, notch, cards, status chips, and bullets all land.
The satori bet is not disproven by anything visible in the reference.

Three defects surfaced, and they change how much this output should be trusted:

- **The notch clips screen content.** `LeadsScreen` has no top safe-area inset, so the notch pill
  covers the eyebrow text. `DeviceFrame` must own that inset rather than leaving it to the
  screen.
- **`stack` has no vertical distribution.** A flex column with padding and no `justifyContent`,
  so content piles into the top fifth of a 1350px canvas. Unfinished, not broken.
- **`fullBleed` has zero coverage.** No spec uses it, so one of the four layouts has never been
  rendered by anything at all.

And the finding that changed the token contract: **`slidePadding` is `space['3xl']`, which is
32px on a 1080px canvas.** Correct for a 390pt phone viewport, 3% margin on a poster. This is
the evidence behind the `scale` multiplier in `design.md`, and the general rule that color is
scale invariant while spacing and type are not.

**Net: the reference is a mood board, not a baseline.** It is trustworthy for what the design
should look like, and actively wrong about spacing values. Two of the three rendered layouts
have visible defects, and the fourth has never rendered.

The PNGs live at `carousels/output/hvac-lead-loss-example/` and are gitignored by
`carousels/.gitignore:2`. They exist nowhere else, not in the repo and not in git, so they need
`git add -f` or a negated pattern to survive. Source survives deletion because git holds it,
rendered output does not.

### Pass criteria

The old criteria compared satori output to Remotion output. With M0 defined as a rewrite, that
comparison is measuring the wrong thing: different text shapers and rasterizers cannot agree,
and the reference is now known to contain layout defects that agreement would reproduce. The
gate is:

1. **It renders at all.** No satori throw on `DeviceFrame` or `split`. This is the real go /
   no-go, and it needs nothing from `carousels/`.
2. **It looks right by eye,** against the reference PNGs as a design target rather than a pixel
   target. No missing font weights, no fallback font, no broken letter-spacing, no collapsed
   layout.
3. **It is deterministic from the first render.** Two runs of the same spec produce byte
   identical PNGs, satori compared to satori. This replaces the structural-agreement check and
   is the guarantee actually being sold.

**Scope guard.** One layout, one device frame, one PNG on disk. No token contract, no registry,
no CLI, no tests: those are M1. Writing `registerBlock` means M0 has been left. "Build it
properly" is how a spike becomes a month, and the narrow scope is the only defense.

### Known satori constraints, found by inspecting the reference

Verified against satori's current CSS support. Everything load bearing is supported:
`boxShadow` (including multiple shadows and spread-only rings), `transform: translateX(-50%)`,
`position: absolute`, `overflow: hidden`, `borderRadius`, `textTransform`, `letterSpacing`, and
the `border` shorthand. **`DeviceFrame` is low risk.**

These were found by reading the reference implementation, and they are worth keeping even though
nothing is being ported: they are the specific traps this kind of markup falls into, and the
line references say where to look at a working example of the shape. The full subset rules live
in `CLAUDE.md`.

- **`display: flex` must be explicit on every div with more than one child**, or satori throws.
  `LeadsScreen`, `JobDetailScreen`, and `TodayScreen` all have multi-child root divs with no
  `display` set (`screens/index.tsx:22, 71, 136`), as do several typography containers.
- **`display: 'inline-flex'` is invalid** (`screens/index.tsx:118`). satori accepts only `flex`,
  `contents`, and `none`. Becomes `display: flex` plus `alignSelf: 'flex-start'`.
- **`gap`** is used throughout (`screens/index.tsx:35, 46, 149`). Confirm support on your satori
  version. This is the one property worth checking rather than assuming.
- **`linear-gradient` in the `background` shorthand** (`registry/index.tsx:166`, `fullBleed`)
  likely needs moving to `backgroundImage`.
- **`inset: 0`** (`registry/index.tsx:165`) may need explicit `top`, `right`, `bottom`, `left`.
- **`boxSizing` is ignored**, since satori is border-box always. Verify padding math still lands.

The screens were written satori-shaped by accident: flat flexbox, solid colors, no grid or
filters. Rendering token-driven card layouts naturally produces markup inside satori's subset,
which is a structural argument that the satori bet holds beyond this one spike.

### Fallback if satori fails on `DeviceFrame`

1. Flatten the nested screen markup into simpler satori-compatible structure. Likely sufficient.
2. Pre-render phone screens to PNG once and composite as images rather than live components.
3. Last resort: Playwright for stills. Costs the browser-free CI story, keeps everything else.

---

## Settled decisions

| #   | decision                                           | resolution                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Package name**                                   | **`mediakit`**, with `@mediakit/*` for libraries. Verified available on npm 30 July 2026. The `@mediakit` org still needs claiming manually. Avoids both traps: never "carousel", not bare "screenshot". Covers all three surfaces, where a `screenshot-*` name would have locked us into Surface 2.                            |
| 2   | **Token source format**                            | Plain TS object only in v1, defined as a `Tokens` interface. Adapters are additive, a wrong core shape is not.                                                                                                                                                                                                                  |
| 3   | **Font ergonomics**                                | Explicit paths only in v1. No `node_modules` resolution, no Google Fonts fetch, which would also violate the no-network invariant. Invest in the error message.                                                                                                                                                                 |
| 4   | **Monorepo tooling**                               | pnpm workspaces plus turbo, matching `reeve`. `source-app` uses npm workspaces. Do not inherit that.                                                                                                                                                                                                                            |
| 5   | **Milestone order**                                | Token contract and `registerBlock` moved into M1. Extraction stays M3.                                                                                                                                                                                                                                                          |
| 6   | **Telemetry**                                      | None, ever. Zero network requests at any point including install. Enforced as an architecture invariant in `CLAUDE.md`, because a render that depends on a network response is not reproducible.                                                                                                                                |
| 7   | **Failure posture**                                | Fail early and loudly rather than degrading silently. A wrong asset uploaded to App Review costs more than a failed build. Full table in `CLAUDE.md`.                                                                                                                                                                           |
| 8   | **Where the repo lives**                           | **Standalone repo, open source.** the source app becomes a consumer that installs mediakit, not a host that contains it. Keeps tooling, licensing, and dependency story clean from day one, and "someone else's app works" cannot be tested honestly from inside the app you extracted from.                                    |
| 9   | **License**                                        | **MIT** for everything except `render-video`, which stays MIT itself but carries Remotion as a peer dependency, so the licensing obligation lands on the consumer who opts in. Matches `snapscene` and `@appmockup/cli`, and anything more restrictive costs adoption for no gain.                                              |
| 10  | **M0 is a rewrite, not a port**                    | `carousels/` is a design reference only: no import, no workspace link, no path dependency, either direction. Porting would carry forward code that violates most of the invariants it would be ported into. Detail above.                                                                                                       |
| 11  | **Closed enums banned from the spec schema**       | `preset`, `layout`, `type`, `background`, and `slot` are all open strings resolved against registries. Generalized as invariant 3 in `CLAUDE.md`. A closed set anywhere in the spec means adding a marketing surface requires editing core and cutting a release.                                                               |
| 12  | **`surface` folded into the preset registry**      | It selected no renderer, carried no constraints, and set no dimensions, all of which are properties of the preset. Keeping it meant two sources of truth that can disagree. The preset entry now carries `renderer`, `constraints`, and `scale`.                                                                                |
| 13  | **Layouts are a registry**                         | `registerLayout` is symmetrical with `registerBlock`, and layouts declare their own slots, which makes `slot` validation stricter than the union it replaces. Most new marketing surfaces need a preset; the ones needing more usually need an arrangement, not a content type.                                                 |
| 14  | **Token scale is one explicit multiplier**         | Design system values pass through unchanged and the config declares `scale`, defaulted per preset. Auto-deriving from preset width was rejected as silent-when-wrong; hand-written canvas values were rejected as a second source of truth that drifts. Color is scale invariant, spacing and type are not.                     |
| 15  | **`preset` accepts an array**                      | `string \| string[]`, with `--preset` overriding. The asset knows how many sizes it needs, so fan-out intent is committed and reviewable rather than living in a shell flag. Output nests under the preset name when more than one is produced.                                                                                 |
| 16  | **Blocks receive a `RenderContext`**               | `{ tokens, preset, frameIndex, frameCount }`, with `scale` already applied to `tokens`. Blocks need tokens regardless, so the object exists either way; frame position rides along because widening this signature later breaks every block a consumer has written. Unlocks panorama backgrounds and progress indicators at M2. |
| 17  | **Registration is a config map**                   | `defineConfig({ blocks, layouts })`, with `registerBlock` and `registerLayout` as the primitives underneath. Imperative calls must live in a module, and importing that module to trigger them is the import-time side effect `sideEffects: false` forbids.                                                                     |
| 18  | **The only required token is `color.accent`**      | Everything else defaults, including a bundled font. Forced by three rules colliding: fonts must be buffers, no network requests ever, and `init` must render on first run. The font is part of the install-size budget the CI gate measures.                                                                                    |
| 19  | **Inference happens in `init`, never in `render`** | Token detection, font discovery, and `scale` proposal all run at scaffold time and write a committed file. Invariant 11 in `CLAUDE.md`. A render that depends on inference is not reproducible, and it fails silently.                                                                                                          |
| 20  | **Annotations take typed props, not raw SVG**      | satori supports inline `<svg>` and propagates `currentColor` (verified against `satori/src/layout.ts` on 31 July 2026), so callouts are buildable at M2. Raw SVG stays out of specs because brand rules cannot inspect it and tokens cannot color it. Custom blocks, being TypeScript rather than spec data, may emit any SVG.  |

### Cutover plan

The standalone repo means two copies of the block vocabulary exist for a while. That cost is
real, so it should be time-boxed rather than left open:

1. **M0 to M1:** `carousels/` and `motion/` stay live in `source-app` and are the reference
   implementation. mediakit is built against them but changes nothing in the app.
2. **At the M1 gate:** the source app installs mediakit, moves `JobCard`, `HeroCard`, and
   `StatusChip` into its own block registrations, and **deletes `carousels/`**. Meeting the
   M1 gate and deleting the old directory are the same event. If the delete cannot happen, the
   gate was not met.
3. **At M4:** the same for `motion/`.

Deleting is safe: `carousels/` was added in `f71fc94b` and `motion/` in `bc96988c`, so both stay
recoverable indefinitely via `git show <sha>:<path>`. The only artifact that deletion would
genuinely destroy is the reference output, which is why the M0 prerequisite above commits the
rendered PNGs first. Do not skip that step and then delete.

Do not let the duplicate period stretch past M1. Two diverging copies of the block vocabulary is
the failure mode this whole project exists to eliminate, and running it internally while
building the fix would be an unusually stupid way to lose.

### Public from when

Push the repo public at scaffold time and build in the open. The discovery strategy below
depends on artifacts and a visible README, and both accrue from the first commit. A repo that
appears fully formed at M2 gets one moment of attention, where one that has been visibly worked
on gets found gradually and looks maintained, which is the thing people actually check before
adopting a 0.x package.

The one thing to get right before the first public push is `examples/source-app`. See below.

### What open sourcing exposes

`examples/source-app` is load bearing (it is how the extension API is dogfooded and tested) and it
is also **The source app's real design tokens, product UI, and app screens, in a public repo**.

Most of that is fine, since these screens exist to be posted publicly as marketing anyway. Two
things are not automatically fine and need a decision before the first public push:

- **Unreleased screens or features.** The example must never be the place an unannounced feature
  leaks. Pin it to shipped UI only.
- **Anything real in the sample data.** The current screens use invented customers and addresses
  (`Oak Street Properties`, `2847 Cedar Ln`). Keep it that way deliberately rather than by
  accident, and never let a real customer name reach the example.

---

## Landscape

Researched against the live npm registry, **30 July 2026**. Weekly downloads. Re-check before
launch, since several of these are weeks old and moving.

**App Store screenshots: the real fight, wide open.** Seven packages in five months, all 0.x,
all under 20 weekly downloads, no winner. A crowded field of 0.x packages with no incumbent
means the pain is confirmed and the land is unclaimed.

| package                    | weekly | what it does                                                | gap                                                 |
| -------------------------- | ------ | ----------------------------------------------------------- | --------------------------------------------------- |
| `@appmockup/mcp`           | 17     | MCP wrapper for the below                                   | n/a                                                 |
| `@appmockup/cli`           | 14     | most polished: `init`, `validate`, `preview`, `render`. MIT | JSON style config, store-only                       |
| `@appsolves/appscreen-mcp` | 14     | MCP shim over hosted API                                    | not a real library                                  |
| `snapscene`                | 12     | Expo simulator capture. MIT, **zero deps**                  | capture only, no composition                        |
| `framedeck`                | 12     | Next.js local editor plus CLI                               | ships Next, CodeMirror, and Tailwind _inside a CLI_ |
| `@ezscreenshots/mcp`       | 11     | MCP shim over a paid render API                             | not a real library                                  |
| `screenshot-aso`           | 3      | `@napi-rs/canvas` compositor, MCP-first                     | imperative canvas, not component-based              |

Where all of them are weak: none reads a design system, none is component-driven or extensible,
all are App-Store-only, none validates brand rules, and several carry heavy dependencies.

**Social carousels: empty, with a naming trap.** Zero packages generate carousel images. Every
search result is a UI slider (`embla-carousel` plus `react-slick`, roughly 35M weekly combined).
Unrelated to this project, but they own the term. **Never use "carousel" in the package name or
keywords.**

**OG cards: saturated, do not compete.** `satori` at 3.76M per week, `@vercel/og` at 2.47M, plus
a wrapper per framework. Dropped as a headline surface on 30 July 2026 and replaced with
vertical video. If OG output falls out of the pipeline for free, ship it as an undocumented
preset, but never position on it.

**Closest competitor:** `@appmockup/cli`, roughly 4 weeks old and iterating. Most likely to add
design-token support once someone suggests it. The advantage here is real but **not permanent**,
which is the argument for running M0 sooner rather than later.

---

## Discovery strategy

npm search is a losing or trivial game on all three surfaces. Surface 1 is unfindable behind
35M weekly downloads of unrelated sliders, and Surface 2's entire category tops out at 17
weekly downloads. The channels that actually work:

1. **The repo renders its own README.** Every image generated by mediakit, in CI, from committed
   specs. "Assets as code" stops being a tagline and becomes something a visitor verifies in ten
   seconds. Free, since you are building the renderer anyway.
2. **The source app's marketing doubles as the package's proof.** You need these assets
   regardless, so posting them markets both at once. The dual purpose is not divided attention.
3. **MCP server, second.** Three of seven competitors went MCP-first, so agent-driven use is
   where the intent is. An MCP-only tool cannot run in CI, but as a discovery channel on top of
   a solid core it is a thin wrapper with outsized reach.
4. **Expo and React Native community.** The `snapscene` interop is the wedge, since mediakit
   completes something they already use rather than competing with it.

**Build on Surface 1, publish on Surface 2.** Stills are 80% done, they force the extension API,
and they generate the artifacts that do your marketing. Store screenshots are the findable,
rankable, `check`-able thing you launch with.

---

## Explicit non-goals

- **Capture.** `snapscene` (MIT, zero deps) already does Expo simulator capture properly.
  Interoperate rather than rebuild.
- **Posting to social media.** Every platform is gated behind developer app registration, review,
  business accounts, or paid API tiers. Users would hit a multi-week bureaucratic wall before the
  library did anything, which destroys adoption, the entire point of an OSS package. It is also a
  permanent unpaid maintenance treadmill across six vendors.
- **Required LLM.** Generation is opt-in, bring your own key. A package that demands
  `ANTHROPIC_API_KEY` before it renders anything has the same permission-gate problem.
  Hand-written specs must work standalone.
- **A design GUI.** `framedeck` went that way and ships Next.js inside a CLI.
- **OG cards as a headline feature.** Saturated. See the landscape section in `README.md`.
- **Telemetry of any kind.** See settled decision 6.

---

## Parking lot, real ideas deliberately not in v1

Both are genuinely good. Shipping either in v1 is what kills the project.

- **Share-preview validation.** Check that an OG image survives Slack, X, LinkedIn, iMessage, and
  WhatsApp, by modelling each scraper's behavior (who executes JS, who follows redirects, image
  size limits, cache TTLs, user-agent gating), plus a CI check that fails the build on a broken
  preview. A natural v2, since you generated the image and are therefore the right tool to verify
  it. But it shares **zero code** with the renderer and is a different kernel entirely. It would
  also be the first feature to make network requests, which needs isolating from the render path.
- **Changelog to announcement pipeline.** Git history and conventional commits, to release notes,
  to platform-shaped posts. This is a _source adapter_ feeding the existing spec rather than a new
  pipeline, and the schema already has a `caption` field. The interesting piece is the
  thread-splitting solver: segment text at semantic boundaries under a per-platform character
  budget where URLs count as a fixed weight, with continuation markers that themselves consume
  budget.

---

## M0 result, 3 August 2026

**Pass, on all three criteria. The satori bet holds.** Built from scratch in `spike/`: a
`DeviceFrame` and a `split` layout, rendered to one 1080x1350 PNG.

| criterion             | result                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| 1. renders at all     | pass. No satori throw. 160,940 byte SVG, 158,551 byte PNG                                      |
| 2. looks right by eye | pass. All four Geist weights, no fallback, tracking and uppercase correct, no collapsed layout |
| 3. deterministic      | pass. `fcb72d3eac14d2ac839d752b4585eeaa74bf42029595b5d46ff580386f290307`                       |

Notes worth keeping:

- **Determinism was re-checked across processes**, not only within one. The spike's own harness
  renders twice inside a single `node` run, which shares satori's font cache and cannot
  distinguish "deterministic" from "cached". A second, separate invocation produced the same
  hash. Golden-file tests at M1 inherit this trap and must spawn.
- **One platform only.** The hash is macOS arm64. `@resvg/resvg-js` ships per-platform native
  binaries, so agreement with Linux CI is unverified and currently load bearing for the entire
  "assets as code" claim.
- **The notch defect did not reproduce.** `spike/screen.ts` insets content by the notch height,
  confirming that `DeviceFrame` owning the safe area is the right split.
- **No React and no build step.** satori renders plain `{type, props}` objects, so `spike/h.ts`
  is 25 lines and `node render.ts` runs the TypeScript directly. This is why `@mediakit/core` can
  own an `Element` type without taking a React dependency.
- `fullBleed` and `stack` remain uncovered, as they were in the reference. They are M1's problem
  now, as registered built-in layouts with tests.

## M1 progress, 3 August 2026

**A spec renders to PNG end to end.** `core`, `blocks`, and `render-still` are landed, 51 tests
pass, and both social presets render at their exact dimensions with no browser anywhere.

The build order was changed deliberately: a thin vertical slice (renderer plus four blocks and
four layouts) rather than the written order of all built-in blocks first. The reason is the same
evidence that produced the golden-file rule. Ten blocks written before a renderer exists is ten
components verified by nothing, against a CSS subset whose violations throw at render time.

That paid immediately. `h` in core had dropped the M0 spike's single-child collapse, whose comment
had framed it as a readability nicety. It is load bearing: satori does not unwrap a one-element
children array, so `children: ['text']` throws the "explicit display: flex" error on markup with
one child. The bug was in the most-used function in the render path, and every block and layout
would have been written on top of it. It is now a satori constraint in `CLAUDE.md` with a test.

Two further findings worth keeping:

- **The single scale multiplier has a visible cost, and it is not the one predicted.** `design.md`
  expected radius to bite first. In practice type did: at `scale: 2.5` the `display` token is 85px,
  which reads well full width in `centered` and cannot fit a `split` column. No layout can rescue a
  word wider than half the canvas, so this is an authoring constraint rather than a bug.
- **Bundling two font weights constrains the default type scale.** `DEFAULT_TYPE` may only name 400
  and 700, since satori substitutes a missing weight silently. A test holds the two together.

## Immediate next action

M2. The M1 gate is met: `examples/source-app` registers a custom block, a custom layout, and a
custom preset from outside `@mediakit/core` and renders `marketing/launch/frame-01.png`
byte-deterministically, SHA `1ea9b25b…`, reproduced by a fresh run.

`preview`, the listing presets (`ios-6.9`, `ios-6.5`, `ipad-13`, `play-phone`,
`play-feature`, `play-icon`, plus the verified-against-docs web presets), and the six remaining
built-in blocks (`Subhead` `Stat` `CTA` `DeviceFrame` `Caption` `Background`) are the M2
surface. `preview` and the listing presets are landed; `check` is landed. Before publish,
prove determinism on Linux, since every hash so far is macOS arm64 and the golden-file
rule rests on it.
