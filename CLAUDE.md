# CLAUDE.md

Rules for working in this repo. `README.md` is the pitch, `design.md` is the architecture,
`roadmap.md` is the plan. This file is what the code must obey.

---

## What mediakit is, for the purposes of these rules

A build-time CLI and rendering library. It runs on a developer machine or in CI, as a
devDependency. It never ships to an end user's device, never enters an application bundle,
and never runs in a browser, on an edge runtime, or under SSR.

Rules written for runtime SDKs mostly invert here. When in doubt, ask which is worse: a build
that fails, or a wrong asset uploaded to the App Store. It is always the second one.

---

## Architecture invariants

These are not style preferences. Each one, if violated, breaks something the project's
positioning or licensing depends on.

1. **`core` must never import `remotion`, directly or transitively.** Remotion's Free License
   covers orgs up to 3 employees. Anything larger needs a paid Company License, so if core
   depends on it, every 4+ person company installing mediakit inherits that obligation. Video
   lives in `render-video` as an opt-in package with Remotion as a peer dependency.

2. **`core`, `blocks`, and `render-still` must stay browser-free.** No Playwright, no
   Puppeteer, no headless Chrome. Rendering without a browser is what makes mediakit viable in
   CI, which is the entire "assets as code" story.

3. **Nothing in the spec schema may be a closed set.** Every field that names a capability is
   an open `string` resolved against a registry at render time: `preset`, `layout`, `type`,
   `background`, `slot`. A `z.enum` or a TypeScript union in the spec schema means the only
   way to add a size, an arrangement, or a content type is to edit core and cut a release,
   which is the difference between a tool that scales to a new marketing surface and one that
   has to be forked.

   Pixel dimensions are the worst case and the reason this rule exists: a literal width or
   height anywhere in the spec collapses the project back into three separate tools. But the
   old implementation closed four other fields the same way (`layout`, `background`, `slot`,
   and the block type union in `carousels/src/spec/schema.ts:42`), and each one is a wall a
   consumer hits without warning.

   Validation does not get weaker. It moves from the schema to the registry, where the error
   message can list what is actually registered.

4. **Every block registers a Zod schema.** No block is renderable without one. The schema is
   the single source of truth for validation, for TypeScript types (via `z.infer`), and for
   the LLM's structured output.

5. **The LLM's block vocabulary is derived from the registry at runtime, never hardcoded.**
   The old implementation kept a `REGISTRY_CATALOG` string
   (`carousels/src/remotion/registry/index.tsx:193`). Do not reintroduce it. If registering a
   custom block does not immediately teach the generator about it, the extension API is broken.

6. **Nothing app-specific ships in `packages/blocks`.** Built-ins are generic only: `Eyebrow`
   `Headline` `Subhead` `Body` `BulletList` `Stat` `CTA` `DeviceFrame` `Caption` `Background`.
   `JobCard`, `HeroCard`, `StatusChip`, and app screens belong in `examples/source-app`. If a
   block's props name a domain concept (`customerName`, `isOverdue`), it is not a built-in.

   `examples/source-app` is a public directory in a public repo. It may contain only shipped UI and
   invented sample data. An unreleased feature or a real customer name reaching it is a leak, not
   a bug.

   Every default path a newcomer touches uses generic blocks only: `mediakit init` scaffolding,
   README examples, and docs snippets. A first-time user should reach a rendered image without
   ever seeing a `JobCard`. The source app is where they look to see the extension API used in
   anger, not what they copy to get started. Extracted from one app is pedigree, works only for
   one app is a dead package, and the difference is entirely in which code a stranger meets first.

7. **The render path must be deterministic.** No `Date.now()`, no `Math.random()`, no network
   calls, no filesystem reads outside explicitly declared inputs. Same spec plus same tokens
   plus same fonts must produce a byte-identical PNG across runs. This is what makes assets
   diffable in git.

8. **No telemetry, no analytics, no phone-home, no remote configuration.** mediakit makes zero
   network requests at any point in its lifecycle, including install. This is not only a
   privacy position: a remote flag or version check would break invariant 7 outright, since a
   render whose behavior depends on a network response is not reproducible. It also means
   there is no update channel to disable a bad release in the field, so correctness has to be
   established before publish rather than patched after.

9. **Blocks read tokens. Blocks never hardcode style values.** No hex colors, no magic spacing
   numbers, no font stacks inside a block component. If a value cannot come from `Tokens`,
   that is a signal the token contract is missing something. Extend the contract rather than
   working around it.

10. **Brand rules are config, not code.** `noExclamations`, `maxHeadline`, and `forbiddenWords`
    come from `mediakit.config.ts`. Never hardcode a brand constraint into a schema the way
    `noExclamation` currently is in `carousels/src/spec/schema.ts:7`.

11. **Inference happens in `init`, never in `render`.** Detecting tokens from a Tailwind config,
    finding font files on disk, proposing a `scale`: all of it belongs to scaffolding, which runs
    once, is watched by a human, and writes a file that gets committed and reviewed. `render`
    reads that file and does nothing clever.

    A render whose behavior depends on inference is not reproducible, which breaks invariant 7,
    and it fails in the specific way this project exists to prevent: an unrelated edit to a
    Tailwind file silently changes an already-approved App Store screenshot, with no error and
    no diff to point at.

    The pressure to add one small render-time convenience will arrive, and it needs a rule to
    lose to. Discover it, propose it, write it down.

---

## Public API and versioning

mediakit is built to be reused, by strangers and by your own later projects. That makes the
public surface a contract rather than an implementation detail.

- **Every package declares its public API explicitly** through the `exports` field. Anything not
  listed is internal and may change in a patch release. Deep imports into `dist` or `src` are
  not supported.
- **Semver, honestly applied.** Renaming a token key, tightening a Zod schema, changing a preset's
  dimensions, or altering what a built-in block renders are all breaking changes. Pre-1.0 this
  means minor bumps, and the discipline still applies.
- **Every breaking change gets a changelog entry with a migration line.** You will be the person
  reading it when a project from six months ago stops building.
- **No app-specific vocabulary in a public type.** Semantic names from any one design system
  (`accentTint`, `pageBg`) must not appear in core's types. Open strings resolved against tokens,
  not closed enums. See `design.md`.
- **Assume a consumer who is not in this repo.** If a feature only works because of something
  true about the source app, it is not finished.

## Dependencies and distribution

Consumers judge build tooling on install weight, and `framedeck` losing on exactly this is
already documented in `README.md`.

- **Every dependency is forced onto every app that installs mediakit.** Adding one is a
  decision that needs justifying in the PR description, not a reflex.
- **Prefer native Node APIs.** `node:fs`, `node:path`, and global `fetch` over adding
  `fs-extra`, `axios`, or similar. The unavoidable heavy dependencies are satori, resvg, and
  Zod. Treat that list as closed unless there is a strong argument.
- **ESM only.** No dual CJS/ESM build. **Node 22+ is the floor**, declared in `engines`. Node 20
  reached end of life on 30 April 2026, so flooring there would name a version receiving no
  security patches. Node 22 is supported until April 2027 and is the widest net that is still
  alive; revisit when it approaches EOL.
- **`sideEffects: false`** on `core` and `blocks`, and only where genuinely true. Registering a
  block is a side effect, so registration must be an explicit call the consumer makes, never
  something that happens as a consequence of importing a module.
- **No wide barrel re-exports.** `packages/blocks` must not re-export every block from a single
  index, since that defeats tree-shaking for anyone using three of them. Deep imports are the
  supported path.
- **Nothing heavy runs at import time.** Font buffers, the resvg binding, and the preset
  registry all initialize on first use. Importing `@mediakit/core` should cost approximately
  nothing.
- **CI enforces install size and dependency count.** Bundle size is the wrong metric for a
  devDependency, so gate on installed weight and total transitive dependency count instead,
  and fail the build on regression.

---

## Failure behavior

The guidance to "degrade gracefully rather than throw" is correct for a runtime SDK and wrong
here. A silently degraded render produces a plausible-looking asset that is subtly off brand,
and nobody notices until App Review. Fail early, fail loudly, and say what to do next.

| misuse | required behavior |
|---|---|
| missing `mediakit.config.ts` | throw, name the expected path, suggest `mediakit init` |
| `registerBlock` or `registerLayout` called twice with the same name | throw, name it and both registration sites |
| render called before config is loaded | throw, since this indicates a broken CLI wiring bug rather than user error |
| block props fail their Zod schema | throw, report every failing field at once rather than the first |
| a referenced font weight is not loaded | throw, since satori silently substitutes and a wrong-weight screenshot is the worst outcome |
| an unknown `preset` string | throw, list the registered presets |
| an unknown block `type` | throw, list the registered block types |
| an unknown `layout` string | throw, list the registered layouts |
| a `slot` the frame's layout does not declare | throw, name the layout and list the slots it does declare |

Every one of these messages names the offending file and, where a spec is involved, the frame
index. An error that says only "invalid spec" costs more than it saves.

`check` is the exception in presentation only: it reports all violations together and exits
non-zero, rather than stopping at the first. It still fails the build.

---

## satori constraints

`render-still` targets satori's CSS subset. Violations fail at render time, often with
unhelpful errors, so treat these as lint rules applied by hand.

- **`display` accepts only `flex`, `contents`, `none`.** No `block`, no `inline-flex`, no
  `grid`, no `inline-block`. For an element that should hug its content, use `display: flex`
  plus `alignSelf: 'flex-start'`.
- **Any element with more than one child needs an explicit `display: flex`.** satori throws
  otherwise. This is the single most common porting failure.

  **A single-element children array counts as more than one child.** satori does not unwrap
  it, so `children: ['text']` throws "Expected `<div>` to have explicit display: flex" on
  markup that visibly has one child, and the message points at the wrong problem. `h` in
  `@mediakit/core` collapses a lone child to a scalar for exactly this reason, and core's
  tests assert it. Verified against satori 0.29.
- **No CSS grid.** Flexbox only.
- **`boxSizing` is ignored.** satori is always border-box.
- **Gradients go in `backgroundImage`,** not the `background` shorthand.
- **Fonts are buffers, not family names.** Every weight referenced must be loaded and
  registered explicitly, or satori silently falls back.

Supported and safe to use: `position: absolute`, `overflow: hidden`, `borderRadius`,
`boxShadow` (including multiple shadows and spread-only rings), `transform` with percentage
translate, `textTransform`, `letterSpacing`, `border` shorthand.

**Inline `<svg>` is supported,** which is easy to assume otherwise and wrong. satori's
`layout.ts` handles `type === 'svg'` by converting the node to a data URI and rendering it as an
image, and the test suite covers `<circle>` with stroke and fill. Paths, arrows, and overlay
layers are therefore available without leaving the block model.

Two consequences worth knowing. satori passes the computed CSS `color` into the nested SVG, so
`stroke="currentColor"` resolves against the parent element and annotations stay token-driven
rather than hardcoding hex values. And the nested SVG keeps its own `viewBox` coordinate space
rather than participating in satori's layout, so overlays are positioned in canvas or percentage
coordinates.

satori's own output is an SVG string, so injecting elements between satori and resvg is also
possible. Prefer inline `<svg>`: it stays inside the block model and needs no pipeline hook.

**Not supported:** `perspective` and `rotate3d`. Three-dimensional tilted device mockups are not
achievable and need a pre-rendered asset. Say so in the docs rather than letting a consumer
discover it.

---

## Code conventions

- **TypeScript strict.** No `any`. No non-null assertions in the render path.
- **Zod schemas are the source of truth for types.** Derive with `z.infer` and never hand-write
  an interface that duplicates a schema. The old registry cast props block by block
  (`props.text as string`, roughly 11 times). The registry should be typed so that is
  unnecessary.
- **Named exports only.** No default exports anywhere.
- **One block per file,** named after the block.
- **pnpm workspaces plus turbo.** Not npm workspaces, which is what `source-app` uses. Do not
  inherit that.
- **Prettier for formatting, ESLint for correctness.** No style debates in review.
- **Public API changes require a docs change in the same commit.** `design.md` describes the
  contract, and a contract that drifts from the code is worse than no contract.
- **No em dashes or en dashes in prose, comments, or documentation.** Use commas, colons,
  parentheses, or separate sentences. Hyphens inside compound words are fine.

---

## Comments

- **Do not restate the code in English.** No `// increment counter`, no `// loop through
  items`, no `// return result`.
- **Comment only on why.** A decision and its alternative, a non-obvious constraint, a
  workaround and what it works around, or something a future editor could easily get wrong.
- **The test before writing one:** would a competent engineer reading this code still be
  confused without it? If no, delete it.
- **Prefer a better name over an explanatory comment.** If a comment exists to explain what a
  variable is, rename the variable.
- **Zero comments in a block of code is fine** and usually correct.

Places in this codebase where a comment genuinely earns its place: satori subset workarounds
(the constraint is invisible from the code), Apple and Google store constraints (cite the
requirement so a future reader knows it is external and not arbitrary), and anything load
bearing for determinism.

---

## Testing

- **Every preset gets a golden-file test.** Render, compare bytes. This is the determinism
  guarantee, and it has to be enforced mechanically rather than asserted in a README.
- **Golden files compare satori output to satori output.** Never to Chrome or Remotion, since
  different rasterizers cannot agree at the pixel level and a test comparing them will be
  permanently red. See the M0 pass criteria in `roadmap.md`.
- **Every entry in the failure table above gets a test** asserting both that it throws and that
  the message names the offending file.
- **Every store constraint in `check` gets a failing-case test.** The value of `check` is
  catching a rejection before upload, and an unverified check is worse than none.
- **A multi-frame spec asserts that its frames render to distinct bytes.** The reference
  renderer shipped a bug for its entire life where every slide rendered as slide 1: exit code
  0, five correctly named files, correct dimensions, no warnings, and console output announcing
  slides it was not writing. Nothing but hashing the output could have caught it. Distinctness
  is a property of the test, not of the renderer, since a spec may legitimately repeat a frame.
- **`examples/source-app` is a test, not a demo.** If it stops building, the extension API broke.
- **The example exercises all three registries from outside core:** a custom block, a custom
  layout, and a custom preset. Extensibility that is not mechanically tested decays, and it
  decays silently: a layout registry only ever used by built-in layouts will grow assumptions
  that hold for core and fail for a consumer, and nothing will report it. One of each is the
  cheapest guard, and it is the same code a stranger writes.

---

## Current status

**M0 passed on 3 August 2026.** All three criteria met by `spike/`: it renders with no satori
throw, it matches the reference by eye with no fallback font and no collapsed layout, and two
runs produce byte-identical PNGs (`fcb72d3e…`) across separate processes, not only within one.
`spike/` is throwaway and is deleted once `render-still` renders the same frame.

**M1 is in progress.** A spec now renders to PNG end to end, with 51 tests passing.

Landed:

- `packages/core`: token contract, spec schema, the three registries, failure-table errors,
  and Geist at 400 and 700 as the bundled default font (SIL OFL, licence at `core/fonts/OFL.txt`).
- `packages/blocks`: `Eyebrow` `Headline` `Body` `BulletList`, and all four layouts
  (`centered` `stack` `split` `fullBleed`), including the two the reference never rendered.
- `packages/render-still`: satori plus resvg, no browser. Determinism is asserted by spawning a
  second process, since two renders inside one process share satori's font cache and cannot
  tell reproducible from cached.

Still open: `packages/cli`, `examples/source-app`, and the remaining built-in blocks
(`Subhead` `Stat` `CTA` `DeviceFrame` `Caption` `Background`).

Three things a future editor should know rather than rediscover:

- **Determinism is verified on macOS arm64 only.** `@resvg/resvg-js` ships per-platform native
  binaries, so byte-identical output between a developer's machine and Linux CI is still an
  assumption, and the golden-file rule below rests on it entirely.
- **`DEFAULT_TYPE` may only name weights `DEFAULT_FONT` ships.** Two weights are bundled, so the
  default scale is expressed in 400 and 700 alone. satori substitutes a missing weight silently.
  A test asserts the two stay consistent; do not add a 500 to one without the other.
- **Display-size type does not fit a `split` column.** `minWidth: 0` stops a column from
  refusing to shrink, but no layout can rescue a single word wider than half the canvas. The
  answer is authoring: point the block at a smaller type token.
