# Releasing

mediakit makes no network requests at any point in its lifecycle, install included (invariant 8).
That has a consequence worth stating before the steps: **there is no update channel and no way to
disable a bad release in the field.** A published version is what every consumer has until they
choose to upgrade. Correctness is established before publish or not at all.

## Before anything

Two gates, and only one of them is code.

1. `pnpm conformance` passes. That is the M3 gate: extraction produces a correct config for
   design systems nobody in this repo wrote.
2. The example's generated store assets have been uploaded to App Store Connect as a draft, and
   the result is recorded in `roadmap.md` with a date. Everything mediakit claims about store
   constraints is otherwise verified against published numbers rather than against a real
   submission, and the whole pitch is that it catches a rejection before upload.

## 1. Re-verify the names

```bash
for name in mediakit mediakit-core mediakit-blocks mediakit-render-still; do
  npm view "$name" version 2>&1 | head -1
done
npm view @mediakit/core version
```

Last checked 31 July 2026, when all of them were free. npm has no reservation mechanism, so a
name is only held by publishing it, and `mediakit` is a common enough word to be at genuine risk.
Note that `@mediakit-dev/react` exists, so somebody adjacent is already in this namespace.

## 2. Settle the naming plan

- **Plan A** (preferred): `mediakit` plus a `@mediakit` org for the libraries. The org is a web
  form at npmjs.com/org/create, not a CLI command, and whether it is claimable has never been
  confirmed, because that check needs an authenticated session.
- **Plan B**: `mediakit` plus unscoped `mediakit-core`, `mediakit-blocks`, `mediakit-render-still`,
  `mediakit-cli`. No org needed.

Fall back to B without hesitation. The rename touches five `package.json` files, their `exports`
maps, the cross-dependencies, and the docs, and it is mechanical. What is not mechanical is
discovering after publish that half the names went one way and half the other.

## 3. Log in

```bash
npm login
```

The browser step was left unfinished the last time this was attempted, which is why nothing is
published yet.

## 4. Promote the changelog

Move everything under `## Unreleased` in `CHANGELOG.md` into a dated version heading. Every
breaking change needs its migration line; pre-1.0 they arrive as minor bumps and the discipline
still applies.

## 5. Run every gate

```bash
pnpm build
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm budget          # installed weight and transitive dependency count
pnpm pack-smoke      # the packed tarballs install and run from outside the workspace
pnpm conformance     # extraction is correct for a stranger's design system
```

## 6. Publish, in dependency order

```bash
for pkg in core blocks render-still cli mediakit; do
  npm publish --access public -w "packages/$pkg"
done
```

Order matters: each package's dependencies must already resolve on the registry, and `mediakit`
is the facade that depends on all of them.

## 7. Verify against the registry, not against a tarball

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i -D mediakit
npx mediakit init . --preset ig-portrait
npx mediakit render marketing/example.spec.json
npx mediakit check marketing/example.spec.json
```

`pack-smoke` already proves this against local tarballs, which is why it is in CI. This step
exists because the thing being verified is different: that what the registry actually serves,
after its own packing and resolution, is what was tested. Given there is no way to pull a bad
release back, the last check has to be against the real thing.
