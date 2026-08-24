# expo-tokens

A React Native / Expo app. There is no CSS to read, so the palette lives in a TypeScript module
and that module is the source of truth for both the app and anything generating assets from it.

Proves:

- `flattenModuleTokens` walking nested exports into dotted names, and the matcher resolving
  `color.semantic.text.primary` against `text.primary`
- a `.ts` source loaded through the `--experimental-strip-types` path
- `parseModuleTypeSteps` reading a type scale expressed as objects with `fontSize` and
  `lineHeight` rather than as CSS lengths
- the dark-palette branch: this is a dark theme, so `canvas` is the darkest colour and `ink` the
  lightest, which is the opposite of every other fixture here
- the bundled-Geist fallback, since the fixture ships no font files

**The bug this fixture found.** `accent`'s name patterns put `^primary$` ahead of `brand`, and
`^primary$` is matched against the last dotted segment, so `color.semantic.text.primary` claimed
`accent` before `color.brand.500` was ever considered. `ink` then matched the same token. The
result was an app whose brand colour was discarded and whose eyebrow, CTA, and stats all rendered
in the same near-white as its body text. It loaded, rendered, and passed `check`.
