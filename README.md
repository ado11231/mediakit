# mediakit

Marketing assets as code. One declarative spec plus your design tokens renders every marketing
surface: social stills, store and web listing images, and (opt-in) vertical video.

```
spec  +  design tokens  ->  deterministic render  ->  platform-sized output
```

## Why

Every marketing asset is made by hand in a design tool, then drifts from the product the moment
you change a color, a font, or a screen. Making them a build artifact of the design system fixes
it. Change a token, run one command, everything regenerates on brand.

## What makes it different

Nothing else reads a design system. Competing packages make you retype your brand into their
JSON, cannot be extended with your own blocks, only handle App Store screenshots, and validate
nothing before you upload. All four gaps are open.

It also sends nothing. No telemetry, no network requests at any point, including install. That
is an architecture invariant rather than a policy, because a render that depends on a network
response is not reproducible.

## Install

```sh
pnpm add -D @mediakit/cli
npx mediakit init
npx mediakit render marketing/example.spec.json
```

`init` scaffolds `mediakit.config.ts` and an example spec that renders on first run: no API key,
no network call, no manual file copy. The only required token is `color.accent`, and a font is
bundled.

Node 22 or later. ESM only.

## Commands

| command   | what it does                                                              |
| --------- | ------------------------------------------------------------------------- |
| `init`    | scaffold `mediakit.config.ts` and an example spec                         |
| `render`  | render a spec to PNG, fanning out across every preset the spec declares   |
| `preview` | serve rendered PNGs over HTTP with live reload on spec, config, font edit |
| `check`   | validate specs and rendered assets against store rules, non-zero on fail  |

`check` also runs against hand-made screenshots with no renderer adopted:

```sh
npx mediakit check ./screenshots --preset ios-6.9
```

## Presets

Social: `ig-portrait` `ig-square` `story` `li-portrait`.
Mobile listings: `ios-6.9` `ios-6.5` `ipad-13` `play-phone` `play-feature`.
Web: `github-social` `producthunt-gallery` `cws-screenshot` `cws-marquee`.

Dimensions are verified against each channel's official docs, and every one carries the
constraints `check` enforces: exact or documented-alternate sizes, frame-count caps, the Play
aspect ceiling, and 24-bit output where a store rejects an alpha channel. Presets are a
registry, so a size mediakit does not ship is a registration rather than a fork.

## Determinism

The same spec, tokens, and fonts produce a byte-identical PNG on every run and every platform.
All 13 presets are golden-file tested, and cross-platform byte identity was verified on macOS
arm64 and Linux x64. That is what makes assets diffable in git, and it is enforced mechanically
rather than asserted here.

## Extending

Blocks, layouts, frames, and presets are all registries, and registration is config rather than
an import side effect:

```ts
export default defineConfig({
  tokens: { color: { accent: '#7C3AED' } },
  blocks: { PricingCard },
  layouts: { 'pricing-split': pricingSplit },
  presets: { 'preview-card': { width: 1080, height: 1350, renderer: 'still', scale: 2.5 } },
});
```

`examples/source-app` exercises exactly this from outside core, and it is a test rather than a
demo: if it stops building, the extension API broke.

## Status

**M2 complete.** Stills render end to end across social, mobile listing, and web presets, with
`check`, `preview`, and the extension API landed. `render-video` is M4 and not yet started.

Pre-1.0, so breaking changes arrive as minor bumps with a migration line in `CHANGELOG.md`.

## Docs

| file           | contents                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| `design.md`    | architecture: spec, tokens, block registry, presets for all three surfaces |
| `roadmap.md`   | milestones, settled decisions, competitive landscape, non-goals            |
| `CLAUDE.md`    | architecture invariants and code conventions                               |
| `CHANGELOG.md` | breaking changes and migration lines                                       |

## Origin

mediakit was extracted from a production app, where the same block vocabulary had
been built twice by hand: once for static social posts, once for animated video. That
duplication is what made the abstraction obvious enough to pull out.

The source app remains the reference consumer. `examples/source-app` is a real config that
has to keep building, which is what stops the extension API from rotting. It is an example,
not a dependency, and nothing in core knows it exists.

## License

MIT. `render-video` carries Remotion as a peer dependency, which is free for individuals,
non-profits, and organizations up to 3 employees, and paid above that. Nothing else pulls
Remotion in.
