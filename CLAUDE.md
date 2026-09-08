# Repository rules

Mediakit is a build-time CLI for typed marketing campaigns and real app captures.

- Use clear names and short comments explaining non-obvious decisions.
- No em dashes or en dashes in code, comments, or documentation.
- Use strict TypeScript. Validate external configuration with Zod. No `any`.
- Publish one ESM package. Keep native capture tools optional.
- Design discovery reports candidates. Rendering resolves only explicit mappings.
- Missing used design values, fonts, captures, and overflowing text fail rendering.
- Reuse real screens through isolated fixture entries. Never seed production databases.
- Capture uses local fixture services. Composition uses local declared assets only.
- Preview displays exported PNG artifacts. Export validates before replacing output.
- Reproducibility applies to a pinned browser, OS, fonts, and simulator environment.
- No telemetry, watermark, or unsolicited network requests.
- Library exports are named. User configuration may use default exports.
- Update documentation with public API changes and include a migration note for breaks.
- Run typecheck, lint, tests, build, and the external package smoke test before shipping.
- Commits use conventional title-only messages under ado11231. Never add co-author trailers.
