const INTERNAL = '/registry/';

/**
 * The failure table requires a duplicate registration to name both registration sites,
 * which the registry cannot know unless it records where `register` was called from.
 * Stack shapes vary by runtime, so this degrades to a placeholder rather than throwing:
 * a worse error message must never become the reason a build fails.
 */
export const callSite = (): string => {
  const { stack } = new Error();
  if (stack === undefined) return 'unknown location';

  for (const line of stack.split('\n').slice(1)) {
    if (line.includes(INTERNAL)) continue;
    const trimmed = line.trim().replace(/^at\s+/, '');
    if (trimmed.length > 0) return trimmed;
  }

  return 'unknown location';
};
