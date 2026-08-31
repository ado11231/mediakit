<h3 align="center">mediakit</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/mediakit"><img src="https://img.shields.io/npm/v/mediakit?style=flat&color=CB3837&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-5FA04E?style=flat&logo=nodedotjs&logoColor=white" alt="Node 22 or newer"></a>
  <a href="https://github.com/ado11231/mediakit/actions/workflows/ci.yml"><img src="https://github.com/ado11231/mediakit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="MIT license"></a>
</p>

<p align="center">App Store screenshots, carousels, and social images, rendered from a JSON spec.</p>

<br>

<p align="center">
  <img width="240" src="docs/assets/store-card.png" alt="An App Store screenshot: an app screen in a phone frame under a headline">
  &nbsp;&nbsp;
  <img width="240" src="docs/assets/launch.gif" alt="A three frame pricing carousel cycling through Solo, Pro, and Team cards">
</p>

<p align="center">
  <sub>A store listing and a social carousel, both rendered in CI from specs in this repo.</sub>
</p>

<br>

Marketing images are usually built by hand in a design tool, which makes them slow to change and
impossible to review. Rename a tier or pick a new brand colour and someone reopens twenty
artboards, and nobody can tell from a pull request what changed.

mediakit renders them from a JSON file plus the colours and fonts your app already uses. No
browser, no design tool, no network. The same spec and tokens always produce the same bytes, so
the images live in git beside your code, a change shows up as a diff, and editing one colour
updates every asset that uses it. Before you upload, it checks the result against the store's
published rules.

## Quickstart

Node 22 or newer and a `package.json` is the whole requirement. A font ships with it, so the
first render needs no setup.

```bash
npm i -D mediakit
npx mediakit init
npx mediakit render marketing/example.spec.json
```

Run it twice and the bytes are identical. Already have a design system? `init --from` reads your
colours and fonts and writes the config for you, marking what it inferred and what it guessed.

```bash
npx mediakit init --from app/globals.css --fonts assets/fonts
```

## Commands

| command   | what it does                                           |
| --------- | ------------------------------------------------------ |
| `init`    | write a config and an example spec                     |
| `new`     | write a complete spec from a template                  |
| `render`  | render a spec to PNGs, once per preset it names        |
| `preview` | serve rendered output locally, rendering again on edit |
| `check`   | validate a spec, its text, and its images              |
| `export`  | write an upload ready folder, verified before it lands |
| `presets` | list every size, with its dimensions and store rules   |
| `schema`  | print the spec vocabulary, for a model or a human      |
| `doctor`  | check Node, config, fonts, and the resolved type scale |

`--config <path>` points any command at a different config, and `--help` works on all of them.

A listing frames a screen, so it takes two specs. `new` writes both, leaving only the copy.

```bash
npx mediakit new appscreen --template screen
npx mediakit render marketing/appscreen.spec.json
npx mediakit new store --template listing --screen marketing/appscreen/frame-01.png
npx mediakit render marketing/store.spec.json
```

Then ship it. `export` writes the folder you drag into App Store Connect or the Play Console:
one directory per preset, filenames ordered so the upload order follows the sort, and a
`manifest.json` with a SHA-256 per frame. Every rule runs before anything is written, so a
bundle that exists is a bundle that passed.

```bash
npx mediakit check marketing/store.spec.json
npx mediakit export marketing/store.spec.json
```

`check` also runs against images you already have (`check ./screenshots --preset ios-6.9`), and
catches text your font cannot draw. An emoji with no glyph renders as a blank box and uploads
without complaint, so `check` reads the font and reports the exact codepoint.

## Specs

A spec names one or more presets, which are canvas sizes, and the frames to render. Each frame
names a layout and the blocks that fill it. Every name is looked up in a registry, so a new size,
arrangement, or content type is a registration rather than a fork.

```json
{
  "id": "store",
  "preset": ["ios-6.9", "play-phone"],
  "frames": [
    {
      "layout": "centered",
      "blocks": [
        { "type": "Headline", "props": { "text": "Your whole day, one screen" } },
        { "type": "DeviceFrame", "props": { "chrome": "phone-notch", "src": "today.png" } }
      ]
    }
  ]
}
```

Output lands in `marketing/<spec-id>/frame-NN.png`, nested under the preset name when a spec
lists more than one. Commit those PNGs, because a changed image in a pull request is then a real
change.

`DeviceFrame` puts a screen inside a phone. Use `chrome: "phone"` when your capture already has a
status bar and `chrome: "phone-notch"` when it does not, which draws one. The bezel is black by
default and `bezel` names a colour token, so a white phone on one frame and a black one on the
next is a per frame choice.

## Config

```ts
export default defineConfig({
  tokens: { color: { accent: '#0D9488' } },
  blocks: { PricingCard },
  layouts: { 'pricing-split': pricingSplit },
  presets: { 'preview-card': { width: 1080, height: 1350, renderer: 'still', scale: 2.5 } },
});
```

Only `color.accent` is required. Blocks read tokens, so changing one changes every frame that
uses it. `init` writes `mediakit.config.ts`, or `.mts` in a project that does not declare
`"type": "module"`.

## Sizes

|            |                                                                      |
| ---------- | -------------------------------------------------------------------- |
| App stores | `ios-6.9` `ios-6.5` `ipad-13` `play-phone` `play-feature`            |
| Social     | `ig-portrait` `ig-square` `story` `li-portrait`                      |
| Web        | `github-social` `producthunt-gallery` `cws-screenshot` `cws-marquee` |

Each is checked against that channel's published rules: exact pixels, frame counts, alpha
channel. `mediakit presets` lists them and works before you have a config. Your own sizes go in
the config.

## Notes

Two renders of the same spec produce identical bytes on macOS and Linux, every preset has a test
asserting it, and nothing is ever composited into an image the spec did not ask for. mediakit
makes no network request at any point, install included. Windows is untested.

`design.md` covers how it works and why. `CHANGELOG.md` lists breaking changes with a migration
line for each. Pre-1.0, so those ship as minor versions.

MIT. Video rendering is a separate package you opt into, and nothing here pulls it in.
