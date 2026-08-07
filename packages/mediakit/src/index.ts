/**
 * `mediakit` is the single package a consumer installs. It owns the `mediakit` bin and
 * re-exports the config-authoring API from @mediakit/core, so a scaffolded
 * `mediakit.config.ts` imports `defineConfig` from the one package that was installed rather
 * than a transitive dependency pnpm's strict node_modules layout would refuse to resolve.
 *
 * Core only, on purpose. The CLI's programmatic surface stays in @mediakit/cli and reaches a
 * consumer through the bin, so importing this entry to author a config never loads the
 * satori/resvg render graph. The star re-export is deliberate: this facade's public contract
 * is exactly @mediakit/core's, and widening core is meant to widen it here too.
 */
export * from '@mediakit/core';
