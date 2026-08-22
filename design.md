# Design

## Package layout

```
mediakit/
├── packages/
│   ├── core          spec schema · token contract · block registry · preset registry
│   ├── blocks        built-in blocks (typography, layout, DeviceFrame)
│   ├── render-still  satori + resvg          -> PNG        MIT
│   ├── render-video  remotion                -> MP4        opt-in peer dep
│   └── cli           init · preview · render · check
└── examples/
    └── source-app    real config plus custom blocks, proving the extension API
```

Published as `mediakit` plus `@mediakit/*` for the libraries. ESM only, Node 22+.

`mediakit` is a thin facade rather than a fifth implementation package. It owns the `mediakit`
bin (delegating to `@mediakit/cli`) and re-exports `@mediakit/core`'s config-authoring API, so a
consumer installs one package and the scaffolded config imports `defineConfig` from `mediakit`.
The facade's main entry re-exports core only, never the CLI, so importing it to author a config
does not load the satori/resvg render graph. This settles roadmap decision 1: the installable
package is `mediakit`, and `npm i -D mediakit` resolves rather than 404s.

---

## 1. Spec, decoupled from dimensions

The single most important change from the existing `carousels/src/spec/schema.ts`:

```ts
// current: dimensions baked into the schema as literals
format: z.object({ width: z.literal(1080), height: z.literal(1350) });

// mediakit: resolved against the preset registry at render time
preset: z.string();
```

Today the spec _is_ a 1080x1350 artifact. Once `preset` is a lookup, the same spec renders to
an Instagram post, a 6.9" screenshot, and a Reel, and adding a platform becomes a registry
entry rather than a schema migration.

```ts
interface AssetSpec {
  id: string; // lowercase slug, /^[a-z0-9-]+$/
  preset: string | string[]; // one or more keys in the preset registry
  frames: Frame[]; // slides · screenshots · scenes
  meta?: { caption?: string; locale?: string };
}

interface Frame {
  layout: string; // a key in the layout registry
  background?: string; // a key in tokens.color
  blocks: Block[];
}

interface Block {
  type: string; // a key in the block registry
  props: unknown; // validated against the block's registered schema
  slot?: string; // validated against the layout's declared slots
}
```

**Every field that names a capability is an open string resolved against a registry.** Not one
of them is a `z.enum`. This is invariant 3 in `CLAUDE.md`, and the reason is that a closed set
anywhere in this schema makes "add a new marketing surface" mean "edit core and cut a release."
Adding blog OG cards or email headers should cost a preset entry in a config file and nothing
else.

Validation does not get weaker, it moves. The registry knows what is registered, so it can list
the alternatives in the error message, which a `z.enum` cannot do for anything a consumer added.

### Why `surface` is gone

An earlier draft carried `surface: 'still' | 'listing' | 'video'` on the spec. It earned nothing:
it did not select the renderer (`still` and `listing` both go through satori), did not carry the
constraints, and did not determine dimensions. All three are properties of the preset. Keeping it
would mean two sources of truth that can disagree, and a consumer obligated to keep them in sync.

The preset registry entry carries all of it:

```ts
interface Preset {
  width: number;
  height: number;
  renderer: 'still' | 'video'; // internal to core, never in a spec
  scale?: number; // see the token contract below
  constraints?: Constraint[]; // alpha rules, count limits, aspect ratios
}
```

This is also what makes `check` possible as a separate command, because constraints become
properties of a registry entry rather than assertions scattered through render code.

### Fan-out lives in the spec

`preset` accepts an array because the asset itself knows how many sizes it needs. A carousel is
one preset. An App Store listing is two, `ios-6.9` and `ipad-13`, because Apple downscales the
rest. Putting that in the spec means the intent is committed and reviewable rather than living
in whatever flag someone typed:

```json
{ "id": "app-store", "preset": ["ios-6.9", "ipad-13"], "frames": [ ... ] }
```

```
marketing/app-store/ios-6.9/frame-01.png
marketing/app-store/ipad-13/frame-01.png
```

`mediakit render <spec> --preset <name>` overrides, for rendering a single size while iterating.
Output nests under the preset name whenever more than one is produced.

---

## 2. Token contract

The differentiator. No competing package reads a design system.

```ts
interface TokensInput {
  // what a consumer writes
  color: Record<string, string> & { accent: string };
  font?: Partial<{ display: FontSource; body: FontSource }>;
  type?: Record<string, TypeStyle>;
  space?: Record<string, number>;
  radius?: Record<string, number>;
  scale?: number; // overrides the preset's default
}

interface ResolvedTokens {
  // what a block receives
  color: Record<string, string>;
  font: { display: FontSource; body: FontSource };
  type: Record<string, TypeStyle>;
  space: Record<string, number>;
  radius: Record<string, number>;
}

interface TypeStyle {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'none';
}

interface FontSource {
  family: string;
  files: readonly { path: string; weight: number; style?: 'normal' | 'italic' }[];
}
```

Three shapes here are load bearing and were not obvious from the earlier draft.

**`ResolvedTokens` has no `scale`.** It has already been applied, so a block reading it would be
reading a number that no longer means anything. Its absence is also what makes handing raw
`TokensInput` to a block a type error rather than a silently cramped render.

**`FontSource` enumerates files per weight.** satori needs a real buffer per weight and
substitutes silently when one is missing, which the failure table calls the worst outcome. One
path per family would make that failure unrepresentable in the config and therefore
undetectable. Supplying only `body` fills `display` from it, so the short config stays short.

**Scaling applies to `space` and `type.fontSize` only.** `lineHeight` is a unitless multiple and
`letterSpacing` is em-relative, so both survive the jump unchanged. `color` and `radius` pass
through per the rule above.

**Defaults are authored at design-system scale, not canvas scale**, meaning the values a real
app's tokens carry for a phone viewport. If the built-in defaults were canvas-sized while an
imported design system was not, the two would need different `scale` values to look alike, and
the default config would be the one thing in the system exempt from the scale contract.

### The type scale is part of the contract

An earlier draft had `font` (which font files to load) but no type scale. That is not enough to
render a `Headline`. Somebody has to decide it is 52px at weight 500 with `-0.04em` tracking,
and if the contract has no home for those numbers they end up inside the built-in blocks. Every
consumer's headlines would then silently render in the source app's typography, breaking invariant 9
and the no-app-vocabulary rule at once.

Slot names must be generic. `display` `title` `headline` `body` `callout` `caption` is a
reasonable neutral set. Define the minimum a design system must supply and give everything else
a documented fallback.

### Scale: the values that do not survive the jump

**Color is scale invariant. Spacing and type are not.** This is the one real limit on the
"reads your design system" pitch, and it is worth stating plainly rather than discovering at M3.

Measured on 30 July 2026 against the reference renderer: `carousels/src/constants.ts` sets
`slidePadding` to `space['3xl']`, which `@source-app/ui` defines as **32**. That is a correct
margin on a 390pt phone viewport and 3% of a 1080px canvas, which is why the `stack` layout in
the reference output has a headline nearly touching the edge. The same applies to type: 52px
display copy is large on a phone and modest on a poster.

An app's spacing and type scales are calibrated to a viewport roughly a third the width of the
smallest canvas mediakit targets. Piping them in raw produces cramped output that looks like a
bug in mediakit.

**Resolution: one explicit multiplier.** The config takes the design system's values unchanged
and declares a `scale`, which the preset can default. At render time a spacing or font-size
token resolves as `value * scale`.

```ts
tokens: {
  space,          // straight from @source-app/ui, unmodified
  type,
  scale: 2.5,     // 32 * 2.5 = 80px padding on a 1080 canvas
}
```

Rejected alternatives, and why:

- **Auto-derive from preset width.** Requires core to assume a reference viewport width. That
  number is a guess, it is invisible to the consumer, and when it is wrong the output is subtly
  cramped with nothing to point at. Silent and wrong is the failure mode this project exists to
  prevent.
- **Make the consumer hand-write canvas values.** Simplest core, but it duplicates the design
  system into a second place that drifts, and it discards the entire reason to read tokens at
  all.

Color and radius are not scaled. Radius is arguable and may need revisiting once `DeviceFrame`
lands at M2, since a 40px phone-screen corner and a 40px poster corner are not the same
gesture.

**v1 accepts a plain TS object only.** `Tokens` is defined as an interface so adapters (Style
Dictionary, Tailwind config extraction, auto-discovery) are additive later. Adapters can be
added at any time, but a wrong core shape cannot be undone. Extraction is M3.

### Keeping the contract universal

This interface is derived from one design system, which is the main way it could go wrong. Two
rules keep it honest:

**No source-app vocabulary in core.** `page`, `surface`, and `accentTint` are semantic names from
`@source-app/ui/tokens`. A frame's `background` is therefore an open string resolved against
`tokens.color` at render time, not a closed enum. A design system that calls its base color
`canvas` must work without patching core. The same applies to `space` and `radius` keys, which
are `Record<string, number>` for exactly this reason.

**Required vs optional is part of the contract.** Define the smallest set a design system must
supply for built-in blocks to render, and treat everything beyond it as optional with a
documented fallback. A block that hard-requires a token most systems do not have is a block
that cannot ship as a built-in.

Cashed out concretely, **the only required token is `color.accent`:**

```ts
export default defineConfig({
  tokens: { color: { accent: '#2563EB' } },
});
```

`space`, `radius`, `type`, `scale`, the remaining colors, and the fonts all have defaults. This
is the README's opening example and the output of `mediakit init`, so it has to be genuinely
this short. Anything added to the required set is paid for by every reader of that example.

Requiring only the accent is a deliberate bet: it is the one value that is unambiguously yours
and that a neutral default cannot fake. Page and text colors have defensible neutral defaults,
spacing and radius have defensible scales, and a wrong-but-neutral render still reads as
unstyled rather than as someone else's brand.

The existing `carousels/src/constants.ts:1` already does
`import { color, radius, semantic, space } from '@source-app/ui/tokens'`. The extraction has
already happened once informally, which is what makes the contract cheap to define.

### Font resolution

**satori requires real font buffers, not CSS `font-family` names.** You load TTF or OTF from
disk, handle weights and styles, and possibly subset.

**v1 requires explicit paths.** No `node_modules` auto-resolution, no Google Fonts fetching at
build time. Both are failure-prone, and remote fetching would additionally break the
no-network invariant in `CLAUDE.md`. Invest in the error message instead. The source app already has
its TTFs on disk at `carousels/public/fonts/`, so M0 and M1 font loading is `fs.readFileSync`.

Font buffers load on first render, never at import time.

**mediakit ships one default font.** This is forced rather than chosen. Fonts must be real
buffers, no network request may ever happen, and `init` must produce an image on first run.
Those three cannot all hold unless a typeface is in the package. Pick one permissively licensed
family at two weights, and treat it as part of the install-size budget the CI gate measures.

`init` discovers font files already in the project (`public/fonts`, `assets/fonts`) and proposes
them, falling back to the bundled default. Whatever it settles on is written into the config as
an explicit path. Discovery happens once, at scaffold time, and never at render time.

---

## 3. Block registry

Each block declares a Zod schema plus one renderer per surface. **The public path is a map in
the config,** which core registers when it loads the config:

```ts
export default defineConfig({
  blocks: {
    JobCard: defineBlock({
      schema: z.object({ customerName: z.string(), status: z.string() }),
      still: JobCardStill, // props inferred as { customerName: string, status: string }
      video: JobCardMotion, // optional
    }),
  },
});
```

**Why `defineBlock` wraps the object rather than the object standing alone.** A bare map is
typed `Record<string, BlockDefinition>`, and TypeScript cannot tie one entry's schema to that
same entry's renderer through a record constraint, so every renderer would receive `unknown`
props and every block would open with a cast. That is the `props.text as string` problem
reappearing at the exact point the registry exists to remove it. `defineBlock` is a generic
over one schema, so `z.infer` flows into the renderer signature and the one crossing from
`unknown` to typed props happens inside a Zod parse.

It also does the erasure. The returned entry carries a renderer that validates its own props and
throws a located error naming every failing field, so the render loop never holds a value whose
schema it has not applied.

`registerBlock` and `registerLayout` exist underneath as the primitives, and the config map is
the supported surface.

**Registries are instances, not module singletons.** `createRegistries()` returns
`{ blocks, layouts, presets }` and `registry.register(name, value)` is the primitive. A singleton
would make registration order significant across test files and let one spec's config leak into
another's render, which is the kind of hidden state that makes a render non-reproducible. It
would also make `applyConfig` un-runnable twice in one process, which `preview` needs. The reason is `sideEffects: false`. An imperative call has to live in a
module, and importing that module to trigger it is exactly the import-time side effect the
dependency rules forbid: it defeats tree-shaking and makes load order significant. Declaring
blocks as data keeps registration explicit (the consumer wrote it) without making an import
load bearing.

Because every block is defined by a Zod schema, the **LLM's structured-output schema is derived
from the registry at runtime**. A user registers a custom `PricingCard` block and the generator
immediately knows it can emit `PricingCard` frames, with no prompt editing.

The current `carousels/src/remotion/registry/index.tsx:193` hardcodes the block vocabulary as a
`REGISTRY_CATALOG` string. Deriving it instead is what makes the system extensible by
strangers, and it is the moat: no competitor can be extended at all.

### Render context

A renderer receives validated props and a context:

```ts
type BlockRenderer<P> = (props: P, ctx: RenderContext) => Element;

interface RenderContext {
  tokens: ResolvedTokens; // scale already applied
  preset: Preset;
  frameIndex: number;
  frameCount: number;
}
```

`tokens` is non-negotiable, since invariant 9 forbids a block from hardcoding style values, so
the context exists no matter what. `frameIndex` and `frameCount` ride along because widening
this signature later would break every block a consumer has written, and because they unlock a
category of effect that is otherwise impossible: background images that pan continuously across
a carousel, "3 of 5" progress indicators, per-frame color rotation.

`tokens` arrives with `scale` already applied. A block reads `tokens.space.lg` and gets a canvas
pixel value, never a raw design-system number it would have to multiply itself.

### Built-in vs. example blocks

Built-in blocks must be generic: `Eyebrow` `Headline` `Subhead` `Body` `BulletList` `Stat`
`CTA` `DeviceFrame` `Caption` `Background`.

`JobCard`, `HeroCard`, `StatusChip`, and the app screens are **source-app-specific** and live in
`examples/source-app`. A stranger has no use for a block whose props are
`{ customerName, address, isOverdue }`. This is not a cosmetic split. It is what forces the
extension API to exist and be dogfooded from M1 onward.

### Layouts register the same way

A block decides what a piece of content is. A layout decides how a frame arranges them, and it
is exactly as extensible:

```ts
export default defineConfig({
  layouts: {
    'feature-grid': defineLayout({
      slots: ['col1', 'col2', 'col3'],
      still: FeatureGridStill,
      video: FeatureGridMotion, // optional
    }),
  },
});
```

A layout renderer receives already-rendered block elements, never raw spec data:

```ts
type LayoutRenderer = (content: LayoutContent, ctx: RenderContext) => Element;

interface LayoutContent {
  blocks: readonly Element[]; // spec order, always populated
  slots: Readonly<Record<string, readonly Element[]>>; // empty when the layout declares none
}
```

Both are supplied so a slotless layout reads `blocks` and a slotted one reads `slots`, with no
reserved slot name that a consumer could collide with.

`centered` `stack` `split` `fullBleed` ship as registered defaults, with no privileged status in
core. A consumer's `feature-grid` and a built-in `split` are the same kind of thing.

**Layouts declare their slots, and that is where `slot` is validated.** `split` declares
`left | right`, `feature-grid` declares three columns, `centered` declares none. This is
stricter than the closed `'left' | 'right' | 'main'` union it replaces, which accepted `right`
on a `centered` frame and silently ignored it.

Validation runs in both directions, because only one of the three cases is the obvious one:

| case                                    | behavior                                          |
| --------------------------------------- | ------------------------------------------------- |
| a slot the layout does not declare      | throw, name the layout and list its slots         |
| no slot, on a layout that declares some | throw. Otherwise the block silently lands nowhere |
| a slot, on a layout that declares none  | throw. This is the reference's exact bug          |

Why this matters for scale: most new marketing surfaces need a preset and reuse everything else,
but the ones that need more usually need an arrangement rather than a content type. A quote
card, a two-up comparison, a three-column feature strip: all layouts, all impossible to add
without this.

The reference renderer is a warning here rather than a model. Its `stack` sets a flex column and
padding but no `justifyContent`, so content piles into the top fifth of the canvas, and its
`fullBleed` was never once rendered because no spec used it. Both were unreachable to fix
without editing the package.

---

## 4. Brand rules as validators

Generalize the existing `noExclamation` refinement and character caps into config:

```ts
brandRules: {
  noExclamations: true,
  maxHeadline: 80,
  forbiddenWords: ['revolutionary', 'game-changing'],
}
```

Voice and tone enforced by a validator rather than a style guide PDF nobody reads.

---

# The three surfaces

## Surface 1: social stills

| preset        | px          |
| ------------- | ----------- |
| `ig-portrait` | 1080 x 1350 |
| `ig-square`   | 1080 x 1080 |
| `story`       | 1080 x 1920 |
| `li-portrait` | 1080 x 1350 |

**Blocks:** `Eyebrow` `Headline` `Subhead` `Body` `BulletList` `Stat` `CTA` `DeviceFrame`

**Source:** roughly 80% lifts directly from `carousels/src/`. The work is the Remotion to
satori port plus token injection.

**Discovery note:** you cannot be _found_ on npm here, because `embla-carousel` and
`react-slick` own the search term. This surface earns discovery through **artifacts, not
search**: it is the only surface whose output gets posted publicly, at volume, to an audience.

---

## Surface 2: listing assets

A **listing** is any distribution channel that publishes exact requirements for the images you
upload. App stores are the obvious case, but they are not a special case, and defining the
surface this way is what keeps mediakit useful for web products.

The pipeline is identical either way: you supply a screenshot PNG, mediakit frames it, captions
it, styles it from your tokens, fans it out to every required size, and `check` verifies the
result against the channel's rules before you upload.

### Mobile presets

Verified against Apple and Google developer docs, July 2026.

| preset         | px          | status                               |
| -------------- | ----------- | ------------------------------------ |
| `ios-6.9`      | 1320 x 2868 | **required** if app runs on iPhone   |
| `ios-6.5`      | 1284 x 2778 | required _only_ if 6.9" not provided |
| `ipad-13`      | 2064 x 2752 | **required** if app runs on iPad     |
| `play-phone`   | 1080 x 1920 | 2 minimum, 4 recommended             |
| `play-feature` | 1024 x 500  | **required**, no alpha               |

`play-icon` (512 x 512, 32-bit PNG **with** alpha) is deliberately not a preset. It is an icon
rather than a screenshot, and the render path composites on an opaque background, so a preset
demanding alpha would promise something the renderer cannot deliver.

Two presets accept more than the size they render, and `check` accepts the whole envelope in
asset mode: `play-phone` takes any size from 320 to 3840 per side at up to 2:1, and
`cws-screenshot` takes 640 x 400 as well as 1280 x 800. Apple's sizes are exact.

Presets carrying the `noAlpha` constraint are re-encoded as 24-bit PNGs. resvg emits colour
type 6 regardless of whether any pixel is transparent, and both stores reject on the channel
being present rather than on the pixels using it.

### Web presets

Dimensions verified against each channel's official docs in August 2026, to the same
standard as the Apple and Google numbers above.

| preset                | px         | channel                          | source                                                            |
| --------------------- | ---------- | -------------------------------- | ----------------------------------------------------------------- |
| `github-social`       | 1280 x 640 | GitHub repository social preview | GitHub Docs: "1280 by 640 pixels for best display"                |
| `producthunt-gallery` | 1270 x 760 | Product Hunt listing gallery     | PH Help: "recommended size for images in the gallery is 1270x760" |
| `cws-screenshot`      | 1280 x 800 | Chrome Web Store screenshots     | CWS Docs: "1280x800 or 640x400 pixels" (1280x800 preferred)       |
| `cws-marquee`         | 1400 x 560 | Chrome Web Store marquee promo   | CWS Docs: "Marquee: 1400x560 pixels"                              |

Constraints: GitHub social is a single image (1-1). Product Hunt gallery requires 2+ images
to be viewable (2-8). CWS screenshots allow 1-5. CWS marquee is a single tile (1-1). GitHub
supports alpha; the others do not explicitly forbid it but do not require it either.

### Frames

`DeviceFrame` is one block with a `chrome` prop rather than a block per device:

```ts
{ type: 'DeviceFrame', props: { chrome: string, src: '...' } }
```

`chrome` is an open string resolved against a small frame registry, for the same reason
everything else is. `none`, `phone`, and `phone-notch` ship as defaults today; a browser, a
tablet, or a watch is a registration rather than a core change, which is the point of the
registry and the reason shipping three rather than eight costs a consumer nothing.

`phone` and `phone-notch` split on one question: does the screen content already have a status
bar? A capture from a device or simulator does, so `phone` draws a bezel and stops. A screen
composed from blocks does not, so `phone-notch` supplies the island, sized from Apple's
published 125x36pt at a 14pt inset on a 440pt-wide display and expressed as fractions of screen
width so it tracks the bezel at any render size.

The split is deliberately not inferred. Detecting an existing island from image content would
put a heuristic in the render path, breaking invariant 11 and, worse, breaking it silently: a
doubled island renders, validates, and uploads. Making it an authoring decision means the
failure is a wrong string in a spec rather than a wrong asset in a store listing.

The device shell reads `color.bezel`, which defaults to `#0B0E14` and cannot fall back to
`canvas`: a light page would render a light bezel and the device would vanish into the
background. A silver or white phone is a token override.

Both variants exist in the source app as visual references, not as code to lift:
`carousels/src/remotion/registry/PhoneMockup.tsx` and `motion/src/components/BrowserMockup.tsx`
(chrome bar, traffic lights, URL bar, content area). As with the carousel and motion
duplication, the abstraction was arrived at twice independently before it was named.

### How much depth this surface needs

Real store listings are more than a framed screenshot, and the gap between "renders" and
"competitive" is entirely composition. Three tiers, by what they cost:

**Tier 1, most of what ships.** Background, caption, framed screenshot. Every primitive for this
exists at M2 with no new architecture. Gradients go in `backgroundImage` per satori's rules.

**Tier 2, the polished look, and still free.** Device bleeding off the edge (`position: absolute`
plus `overflow: hidden`), two devices in one frame (two blocks, two slots), flat-rotated devices
(`transform: rotate`, verify against your satori version the way `gap` is verified), press badges
and rating stars (blocks), a zoomed detail beside a full screen (the same `src` twice, one
cropped).

None of these is a feature. They are layouts, which is the layout registry paying for itself: a
consumer adds a fifth arrangement without touching core.

**Tier 3, real design work.** Panorama backgrounds, one continuous image spanning all five
screenshots so the store carousel feels continuous. This is why `RenderContext` carries
`frameIndex` and `frameCount`: the effect is impossible while frames render independently, and
retrofitting the signature is breaking.

**Out of scope, and say so.** Perspective and 3D-tilted devices need `perspective` and
`rotate3d`, which satori does not support. The workaround is compositing a pre-rendered device
asset. Document this next to the browser-free benefits rather than letting someone discover it,
because it is the most visible thing given up.

### Annotations

Callouts, arrows, and highlights pointing at UI. satori supports inline `<svg>` (see
`CLAUDE.md`), so these are buildable at M2.

**Annotation blocks take typed props, never raw SVG markup.** A spec is data an LLM writes, and
arbitrary SVG in a spec is unpoliceable: brand rules cannot inspect it, tokens cannot control
its color, and a malformed path produces a broken asset that no validation catches.

```ts
{ type: 'Callout', props: {
    shape: 'arrow',
    from: { x: '32%', y: '60%' },
    to:   { x: '58%', y: '44%' },
    color: 'accent',            // a tokens.color key
}}
```

The renderer emits the `<path>`. Colors resolve through `currentColor`, which satori propagates
into nested SVG, so an annotation is token-driven like every other block.

The escape hatch sits one level down: **custom blocks are TypeScript, not spec data, so they may
emit any inline SVG they want.** The constraint belongs on spec authors, not block authors.

One real limit: satori exposes no layout tree, so an annotation cannot anchor to "wherever the
third bullet landed." Coordinates are canvas or percentage values the author supplies. For
pointing at a spot in a screenshot you provided, that is fine. For anything anchored to
reflowing text, it is not.

Two notes carried over from reading them. `BrowserMockup` uses an inline `<svg>` and a
`borderRadius: '50%'`, so confirm both against satori's subset during M2 and be ready to
replace the SVG with a styled div. And `DeviceFrame` owns the top safe-area inset: the
reference leaves it to the screen component, which is why the notch clips the eyebrow text in
`carousels/output/hvac-lead-loss-example/slide-02.png`.

### The scaling rule, encoded as the default

Apple **auto-scales every smaller iPhone size down from the largest you supply**. The correct
default is therefore to render exactly **two** iOS presets, `ios-6.9` and `ipad-13`, rather
than the eight in Apple's table.

Every competitor makes you enumerate sizes manually, and most people over-render six redundant
sets because they do not know about the scaling behavior. Encoding this rule is real, immediate
user value.

### Input contract

You supply a raw screenshot PNG. mediakit frames, captions, styles, and fans out to every
required size. **No capture, ever, on either platform.** For mobile, `snapscene` already solves
simulator capture properly. For web, capture would mean driving a real browser, which
invariant 2 in `CLAUDE.md` forbids outright. Same conclusion from two independent directions,
which is usually a sign the boundary is in the right place.

### Capture is out of scope, which is what keeps it stack-agnostic

Because mediakit never captures, the input is always a PNG the consumer produced however their
stack produces one, and `DeviceFrame`'s `src` is a plain file path that encodes nothing about
where the pixels came from. That is not a limitation pushed onto the consumer, it is the thing
that keeps the input backend-neutral: a Supabase app seeds Supabase, a Firebase app seeds the
emulator, a REST backend hits its own fixtures, a static app is screenshotted by hand, and
mediakit's half is byte-for-byte identical in every case.

The capture command that produces those PNGs is the consumer's and belongs in their app, never
in mediakit or a mediakit plugin core depends on. It almost always needs a simulator or a
browser, so pulling it inside would break invariant 2 and drag a backend into a tool that makes
zero network requests. If an official capture helper is ever warranted it ships as a separate
opt-in package, the way `render-video` isolates Remotion, and browser-driven ones especially
never enter `core`, `blocks`, or `render-still`.

Recommended practice is to commit the screenshots into the repo next to the specs, so a render
stays reproducible and diffable even though the capture that wrote them was not. The framing is
deterministic regardless; only the captured pixels change when the app changes.

The zero-capture path remains available and is the default a newcomer should reach first:
rebuild the screen from tokens as blocks. No app to run, no backend to seed, no simulator, fully
deterministic. Captured real screens are the opt-in upgrade a consumer reaches for when pixel
fidelity to the shipping app matters more than having no capture step at all.

### Constraints enforced by `check`

- No alpha channel on App Store output. Apple rejects transparency.
- 1 to 10 screenshots per device type.
- Play: max dimension no greater than 2x min dimension.
- Play feature graphic and screenshots: JPEG or 24-bit PNG, no alpha.

---

## Surface 3: video (opt-in, M6)

| preset             | px          | notes                                                              |
| ------------------ | ----------- | ------------------------------------------------------------------ |
| `reel`             | 1080 x 1920 | IG Reels, TikTok, Shorts                                           |
| `appreview-iphone` | 886 x 1920  | covers 6.9", 6.5", 6.3", 6.1". **One render, four device classes** |
| `appreview-ipad`   | 1200 x 1600 | 13", 11", 10.5"                                                    |

### App Preview hard constraints (Apple, verified July 2026)

- Duration **15 to 30 seconds**
- Max file size **500MB**
- Frame rate **30 fps or lower**
- H.264 progressive, up to High Profile Level 4.0, 10 to 12 Mbps VBR (`.mov`, `.m4v`, `.mp4`),
  or ProRes 422 HQ at roughly 220 Mbps (`.mov`)
- Audio stereo, 256kbps AAC, 44.1 or 48 kHz, all tracks enabled
- Up to **3 previews per resolution**
- Default poster frame at 5 seconds

All mechanically checkable. Failing _before_ you waste an App Store Connect upload is genuinely
useful and nobody offers it.

### Source, and why it is more than a port

`motion/src/` is a hand-authored film, not a spec-driven renderer. `Promo.tsx:38` hardcodes
`showForm = frame >= 155`, a magic frame number. Turning scenes declarative is real design work
rather than an extraction. Budget accordingly.

### Why it ships as a separate package

Remotion's Free License covers individuals, non-profits, and for-profit orgs with **up to 3
employees**. Anything larger needs a paid Company License. If core hard-depended on Remotion,
every 4+ person company installing mediakit would inherit that obligation.

Isolating video into an opt-in package means users who never render video never pull in
Remotion, and the licensing question never arises for them. Core stays MIT and browser-free,
which is also what keeps it viable in CI.

---

## Renderer split

|                | still                      | video                                   |
| -------------- | -------------------------- | --------------------------------------- |
| engine         | satori + resvg             | remotion                                |
| browser needed | no                         | yes                                     |
| license        | MIT                        | free at 3 employees or fewer, else paid |
| determinism    | byte-identical across runs | frame-stable                            |
| CI-friendly    | yes                        | heavy                                   |

Same spec plus same tokens plus same fonts produces a byte-identical PNG **across runs of
mediakit**. That determinism is what makes assets diffable in git and regenerable in CI, which
is the "assets as code" positioning that made `@vercel/og` spread.

Note the scope of the claim: satori and resvg output is byte-identical to _itself_, not to
Chrome. Different text shapers and rasterizers cannot agree at the pixel level.

---

## CLI

```
mediakit init                     scaffold mediakit.config.ts plus an example spec
mediakit presets                  list registered presets, dimensions, and constraints
mediakit doctor                   Node, config, fonts, and the resolved type scale
mediakit schema  [--format md]    print the spec vocabulary, for an LLM or a human
mediakit preview                  local dev server, live reload on spec or token change
mediakit render <spec> [--preset] render a spec's presets, or one named preset
mediakit check                    validate specs, brand rules, and store constraints
mediakit export <spec> [--preset] write a verified, upload-ready folder per preset
```

`render`, `check`, `preview`, `presets`, and `export` accept `--config <path>`. Without it the config is found only
in the working directory, so a project rendering the same tokens at two scales needs one
directory per config, each with its own `specs/` and output tree, and every script has to `cd`.
Spec-relative paths still resolve against cwd rather than the config's directory, so a
`DeviceFrame` src means the same thing whichever config renders it; font paths in a config
should be built from `import.meta.dirname` for the same reason.

`check` is the cheapest on-ramp in the product. It works standalone, so someone with hand-made
screenshots can adopt it without adopting the renderer.

`check` warns on **legibility**: a store gallery shows a listing screenshot at a fraction of
full size, so type sized for an app viewport disappears there while every existing rule passes.
The threshold is a fraction of canvas width rather than an absolute size, since a canvas is only
ever viewed scaled and the ratio is what survives. It reports at warning severity because the
gallery's display width is not published, and a rule nobody can verify should not fail a build;
`--strict` promotes it on both `check` and `export`.

`doctor` covers the four things that account for most first-run failures (Node version, config
resolution, font files on disk, weight coverage) and prints the type scale resolved per listing
preset as a percentage of canvas width. That table is the answer to the scale question rather
than a rule about it: invariant 11 forbids inferring a scale at render time, so the honest
alternative is showing the number and letting a person decide.

`check` also verifies **glyph coverage**, reading the `cmap` of every loaded font and comparing
it against every string the spec carries. This is the missing-font-weight failure one level
down: satori substitutes silently, so a codepoint no loaded font draws renders blank or as a
tofu box, and nothing else in the pipeline reports it. A codepoint mapped to glyph 0 counts as
missing, since `.notdef` is the tofu box. A font the parser cannot read reports nothing rather
than reporting everything, because a parser limitation must never fail a font that is complete.

It ships as a `check` rule rather than a render-time throw for the same reason the overflow lint
does: it cannot break an existing consumer's build on upgrade. `export` runs the spec rules, so
it is enforced there too.

`schema` is invariant 5 made usable. It walks the registries and emits either JSON Schema, for
a structured-output API, or the same vocabulary as prose, for a prompt or a person. A block,
layout, preset, or colour token registered in `mediakit.config.ts` appears on the next run with
no further work, which is the only way the extension API can be said to work: the reference
implementation kept a hand-edited `REGISTRY_CATALOG`, so registering a block taught the
generator nothing.

The generated enums are not a contradiction of invariant 3. That invariant governs the Zod spec
schema, which stays open so a consumer can add a surface without editing core. This is generated
output describing what is registered at one moment, and naming the alternatives is the point.

Slots are expressed as one frame variant per layout rather than a single frame shape with every
slot name unioned, because `assertSlot` throws in both directions and a schema accepting `left`
on a `centered` frame would describe a spec that does not render.

`presets` is the only other command that works before a project exists. The registry already knows
every size and constraint, and there was previously no way for a consumer to see them without
reading source. A preset registered by the consumer's own config is labelled `custom`, which is
the only confirmation available that a registration took effect short of rendering.

`export` writes the folder a person drags into an upload form: one directory per preset, frames
named `<spec-id>-NN.png` so the upload order follows the filename sort, and a `manifest.json`
recording the dimensions, a SHA-256 per frame, and the constraints that were verified.

Three properties are load bearing.

- **It renders rather than reading `marketing/`.** Reading already-written PNGs would couple
  export to a prior `render` and to that command's directory layout, and would make a stale
  frame exportable in silence. One render path means one set of bytes, and `export` reproduces
  `render`'s hashes exactly.
- **A bundle that exists is a bundle that passed.** Spec rules run before any render, asset
  rules run on every frame, and nothing reaches disk until all of them pass. A half-written
  bundle is worse than none, because it uploads without complaint.
- **The manifest carries no timestamp and no mediakit version.** Either would make the bundle's
  bytes change while the spec did not, which is invariant 7. The manifest is a rendered artifact
  like the PNGs beside it.

Channel packs (`@mediakit/channels`, settled decision 23) layer onto `export` as a `--channel`
flag later. They are not a prerequisite: presets already carry the constraints, so the bundle is
verifiable today against the sizes core ships.

`preview` serves already-rendered PNGs over HTTP and re-renders on change. It does not drive a
browser, it serves files to yours, so invariant 2 is untouched.

`init --from <file>` extracts a palette from CSS custom properties (`:root` or Tailwind v4's
`@theme`) or a TS/JS token module, and scans for font files to enumerate weights. It writes
provenance into the generated config: the source token where a name matched, and a `GUESS`
marker naming the fallback rule where none did. That marker is the point. Inference is allowed
here and nowhere else (invariant 11) on the grounds that a human reviews it, and a reviewer
cannot check a hex value that arrives without a reason attached.

Three of its rules are the product of real palettes rather than of reasoning:

- **Theme darkness is the median luminance**, not the lightest colour. A dark palette still
  carries a near-white text colour, so the extremes answer the same for both themes.
- **`accent` is the most saturated unclaimed colour.** A palette naming its gold `champagne`
  and its background `obsidian` has no name for a reader to match, and picking positionally
  gave an accent identical to the canvas.
- **`bezel` may never equal `canvas`**, which is the phone-shaped-hole trap.

A discovered font family is used only if it covers every weight `DEFAULT_TYPE` names, since
`loadFonts` throws on a missing one and the bundled font is the correct answer rather than a
degraded one.

**`init` must leave the project in a state `render` can consume immediately:** a config, and a
spec on disk that produces a PNG with no API key, no network call, and no manual file copy. The
first run has to output an image.

This is a requirement rather than a nicety because the reference renderer failed it. Its
`export` reads `specs/<id>.json` and its `generate` writes exactly there, so the wiring was
correct, but `specs/*.json` was gitignored and the only committed spec sat elsewhere. A fresh
clone could not render anything without an LLM API key. A tool whose first run produces nothing
until you supply a credential has the same adoption problem as the LLM non-goal describes.

Failure behavior for every command is specified in `CLAUDE.md`. The short version: fail early,
fail loudly, and name the file and frame index.

---

## Configuration ergonomics

The goal is not less configuration, it is less configuration **written by hand**. Those have
different answers, and conflating them is how a deterministic tool acquires magic.

### The boundary: automate `init`, never `render`

Configuration exists so `render` is explicit and reproducible. Every piece of inference moved
into render time is a way to produce a plausible-looking, subtly wrong asset, which is the
failure this project is organized against. Auto-detection that happens once at scaffold time and
gets written to disk is reproducible forever. The same inference at render time means an
unrelated edit to a Tailwind file silently changes an App Store screenshot.

`init` guesses, shows its work, and writes a file a human reviews. `render` reads that file and
does nothing clever. This is an invariant in `CLAUDE.md`, not a preference, because the pressure
to add one small render-time convenience will arrive later and needs a rule to lose to.

### Three tiers of reduction

**Tier 1, defaults.** Everything except `color.accent` is optional, as above. Costs nothing but
discipline about the required set, and it is what makes the README's first example one line.

**Tier 2, `init` reads what is already there.** Two cases with different correct answers:

| tokens live in                              | generated config              | why                                             |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| a TS or JS module (`@source-app/ui/tokens`) | `import` them                 | stays in sync, no parsing, trivially correct    |
| Tailwind config or CSS custom properties    | extract and inline the values | parsing is fragile, a frozen snapshot is honest |

The import case is strictly better where available. This is M3's "token extraction", recast: as
`init`-time codegen it is simpler to build than a runtime adapter and sidesteps the determinism
question entirely.

**Tier 3, `generate` writes the spec.** The largest reduction, because the config is touched once
and specs are touched constantly. Already M3.

### What stays explicit permanently

Font paths and `scale`. `init` discovers and proposes both; the resolved values are written down
and committed. Silent font substitution is on the failure table, and an inferred scale that is
wrong produces cramped output with nothing to point at.
