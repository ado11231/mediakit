# Migrating to 0.2

The single-file quick start is additive: `campaign` can now be an inline campaign object.
Existing campaign paths and the regular `init` workflow remain supported. `init --quick`
creates an editable template and preserves existing configuration.

This is a clean API break. Existing JSON specs and @mediakit/core, @mediakit/blocks,
@mediakit/cli, and @mediakit/render-still imports are not supported by the new package.

1. Install mediakit and run init. Existing files are preserved, so move an old config aside
   yourself if you want a fresh scaffold.
2. Replace guessed/default tokens with explicit source mappings or literal design values.
   Configure actual font files and each used weight. No brand font ships in the package.
3. Move copy into marketing/campaign.ts using defineCampaign. Replace blocks and registries
   with a named layout and its headline, body, screen, and optional position overrides.
4. Rename outputs: ig-portrait to instagram-portrait, ig-square to instagram-square,
   ios-6.9 to app-store-iphone, ipad-13 to app-store-ipad, and play-phone to google-play-phone.
   Other old presets can be defined as custom outputs with explicit dimensions.
5. Register image inputs, or integrate a dedicated web/Expo fixture entry that reuses real UI.
6. Use check, preview, and export. The old new, render, doctor, schema, and presets commands
   are replaced by the typed campaign API, discovery report, and command diagnostics.

Chromium is now required for composition. Native tools are optional and needed only for iOS
capture. The byte-equality guarantee applies to a pinned environment, not different operating
systems. Preview serves actual rendered PNGs. PNG exports are RGB and document exports retain
vector text and embedded fonts.
