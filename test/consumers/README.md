# Conformance fixtures

Tier 1 of the M3 gate. Each directory is shaped like a different ecosystem's repo, not like a
different product, and exists to answer one question: does `mediakit init` produce a correct
config for a design system nobody in this repo wrote?

Invariant 11 confines every piece of inference to `init`, so that question is the whole of "a
second app works". `pnpm pack-smoke` already proves the published packages install and run from
outside the workspace; these prove that what comes out is right.

Run them with `pnpm conformance`. The harness copies a fixture to a temporary directory, links
`mediakit` into it, runs `init`, `render`, and `check`, and compares the generated
`mediakit.config.ts` against `expected/mediakit.config.ts` byte for byte. Nothing here touches
the network, so it is safe on every pull request.

## Changing a fixture

`pnpm conformance --update` rewrites the expectations. **Read the diff.** Extraction is a pile
of heuristics tuned against real palettes, and the reason the expectations are committed is that
a change to one heuristic moves output for repos nobody was thinking about. A diff you did not
intend is the finding, not an inconvenience.

Do not edit an `expected/` file by hand. It is generated, and the harness compares bytes.

## Adding one

A fixture earns its place by proving something none of the others do. Say what that is in its
README. Two constraints:

- **Offline.** These run in CI and may fail the build, so they may not fetch anything. Tier 2
  (pinned SHAs of real public repos) is a separate script, run by hand before a release.
- **A preset that accepts one frame.** `init` scaffolds a single-frame spec, so a preset with a
  floor of two (`play-phone`) fails `check` for a reason that has nothing to do with extraction.

## What they found

On their first run, all three produced configs that loaded, rendered, and passed `check`, and
all three were wrong: an Expo palette whose brand colour was discarded in favour of its text
colour, and a three-colour project that scaffolded white text on a white canvas. Both are fixed,
and both have regression tests in `packages/cli/test/extract.test.ts`.
