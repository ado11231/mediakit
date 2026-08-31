import { describe, expect, it } from 'vitest';
import { positionals } from '../src/argv.js';

describe('positionals', () => {
  it('returns bare arguments in order', () => {
    expect(positionals(['a', 'b'], ['--template'])).toEqual(['a', 'b']);
  });

  it('does not treat a flag value as a positional', () => {
    expect(positionals(['store', '--template', 'listing'], ['--template'])).toEqual(['store']);
  });

  // The bug this module exists for. Naming a spec after the template it came from is the
  // first thing anyone types, and matching flag values by string discarded the id.
  it('keeps a positional that says the same thing as a flag value', () => {
    expect(positionals(['listing', '--template', 'listing'], ['--template'])).toEqual([
      'listing',
    ]);
  });

  it('keeps a positional matching a value belonging to a flag that was never passed', () => {
    expect(positionals(['ig-portrait'], ['--preset'])).toEqual(['ig-portrait']);
  });

  it('ignores boolean flags without consuming what follows them', () => {
    expect(positionals(['store', '--force', 'extra'], ['--template'])).toEqual([
      'store',
      'extra',
    ]);
  });

  it('skips a --flag=value token rather than reading it as a positional', () => {
    expect(positionals(['store', '--template=listing'], ['--template'])).toEqual(['store']);
  });

  it('tolerates a value flag with nothing after it', () => {
    expect(positionals(['store', '--template'], ['--template'])).toEqual(['store']);
  });
});
