# Architecture

Mediakit 0.2 replaces JSON block registries with `defineConfig` and `defineCampaign`.
One package owns design resolution, capture, composition, validation, and export.

Design sources are explicit CSS files or module exports. Discovery never chooses brand values.
CSS mappings are resolved by Chromium, including aliases and the configured theme selector.
Module mappings name an export and property path. Relative paths use the config directory.
Only values used by the campaign are required. Missing values fail with their configuration path.

Campaigns contain named outputs and slides. Layouts are headline-above-device,
text-beside-device, and text-only. Per-output overrides specify typography and positions.
Typography is authored in output pixels. Nothing silently shrinks or truncates text.

Web capture runs a local fixture entry. iOS capture runs a separate Expo fixture build.
Both reuse application screens with memory-only sample data. Production clients must not
initialize in that entry. Browser network blocking does not isolate native SDKs or servers.

Chromium renders compositions at final dimensions. Preview serves those same PNGs.
Export stages all outputs and validates before replacing the last successful bundle.
PNG folders and multipage PDF documents are supported. Manifests record resolved design,
input hashes, renderer versions, and output hashes. Native capture needs macOS and Xcode.
Pixel reproducibility is scoped to the same browser, OS, simulator runtime, and fonts.

This release intentionally removes the old registries, guessed tokens, bundled brand font,
and browser-free promise. See README for the new configuration and capture workflow.
