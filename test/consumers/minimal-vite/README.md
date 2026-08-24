# minimal-vite

The hostile case, and the one most likely to find something: three colours, no type ladder, no
spacing scale, no font files. This is the shape a small project actually has before anyone has
sat down and written a design system.

Proves:

- every contract role is filled, so the generated config type-checks in the consumer's project
- `accent` is always emitted, since it is a required field and mediakit's own blue standing in
  for someone's brand is the exact failure the token contract exists to prevent
- no two roles that need to be readable against each other share a value
- the project still renders and still passes `check` with nothing hand-edited

**The bug this fixture found.** With three colours and a white background named `--bg`, the
median-luminance rule read the palette as dark, `ink` took the lightest colour, and that colour
was the canvas: white text on a white page. The render succeeded, `check` passed, and the asset
was blank. A canvas found by name is direct evidence of the theme and now settles it, and `ink`
falls back to the most readable colour on the canvas rather than to mediakit's near-white default.

Six of the eight colour roles are still marked `GUESS`, which is correct and is the point. A
source with three colours cannot fill eight roles, and the generated config says so on every line
a human needs to decide.
