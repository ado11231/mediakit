/**
 * Positional arguments, resolved by position rather than by value.
 *
 * A flag's value is whatever token follows the flag, so identifying it by string equality
 * discards any positional that happens to say the same thing. That is not a rare collision:
 * `mediakit new listing --template listing` names a spec after the template it came from,
 * which is the first thing anyone types, and it failed by reporting that no id was given.
 * `init` had the sharper version, since its `--preset` default sat in the comparison set even
 * when the flag was absent, so a directory named `ig-portrait` was silently ignored.
 *
 * Only the separated form (`--flag value`) is recognised, matching `findValue`, which is how
 * every command in this CLI reads a flag. A `--flag=value` token is skipped rather than
 * treated as a positional, so it never becomes an id by accident.
 */
export const positionals = (
  argv: readonly string[],
  valueFlags: readonly string[],
): string[] => {
  const taking = new Set(valueFlags);
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!arg.startsWith('-')) {
      rest.push(arg);
      continue;
    }
    if (taking.has(arg)) i += 1;
  }

  return rest;
};
