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

## Status

**Not scaffolded yet.** The gate is **M0**: prove satori can render the existing blocks without
a browser. See `roadmap.md`.

Standalone and open source. The source app is the first consumer and proving ground, not the host.

## Docs

| file | contents |
|---|---|
| `design.md` | architecture: spec, tokens, block registry, presets for all three surfaces |
| `roadmap.md` | milestones, settled decisions, competitive landscape, non-goals |
| `CLAUDE.md` | architecture invariants and code conventions |

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
