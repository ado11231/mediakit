import { describe, expect, it } from 'vitest';
import { defineConfig, parseSpec, resolveTokens } from '../src/index.js';

describe('mediakit facade', () => {
  it('re-exports defineConfig from @mediakit/core as an identity', () => {
    const config = { tokens: { color: { accent: '#000000' } } };
    // A scaffolded config imports this from `mediakit`, so the facade must forward it.
    expect(defineConfig(config)).toBe(config);
  });

  it('re-exports the spec parser and token resolver a config author needs', () => {
    expect(typeof parseSpec).toBe('function');
    expect(typeof resolveTokens).toBe('function');
  });
});
