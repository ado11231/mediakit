# tailwind-next

The common case: a Next.js project on Tailwind v4, which keeps its palette in `@theme` rather
than in a `tailwind.config.ts`, and names it the way shadcn/ui does.

Proves:

- `parseCssTokens` reading `@theme` and stripping the `--color-` namespace
- `parseCssTypeSteps` reading a `--text-*` ladder with its `--line-height` companions
- `parseCssSpacing` reading a base and expanding it onto mediakit's grid. The base here is
  `0.5rem` rather than Tailwind's default `0.25rem`, which is a real choice a project makes and
  is also the only way to exercise the code path: a base that reproduces mediakit's own ladder
  is correctly reported as nothing to write.
- font discovery, weight grouping from filenames, and the "covers every weight `DEFAULT_TYPE`
  names" filter
- **font paths that survive a checkout.** The generated config resolves them from
  `import.meta.dirname`; an absolute path would render here and throw ENOENT everywhere else.

`--color-muted-foreground` deliberately does not match any `inkMuted` name pattern. It is what
shadcn actually calls that token, and the mid-luminance fallback lands on the right colour and
says so. Keeping it is how the fixture reports the state of the matcher rather than flattering it.

## The fonts

`BrandSans-Regular.ttf` and `BrandSans-Bold.ttf` are copies of the bundled Geist under a
different filename, with its OFL licence beside them. The family name in the generated config
therefore differs from the name inside the file, which satori does not care about: it registers
whatever family name it is given.

They are renamed copies rather than a new typeface on purpose. Discovery, grouping, and the
relative-path fix are all exercised by any two files with readable weights in their names, and a
genuinely different font would mean committing another binary and settling a licence question to
test none of it. A non-Latin fixture, where the font is the point, is a separate piece of work.
