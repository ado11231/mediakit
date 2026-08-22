import { describe, expect, it } from 'vitest';
import { checkLegibility, createDefaultRegistries, parseSpec } from '../src/index.js';

const registries = createDefaultRegistries();
const tokens = { color: { accent: '#2563EB' } };

const spec = (preset: string | string[]): ReturnType<typeof parseSpec> =>
  parseSpec(
    {
      id: 'legibility',
      preset,
      frames: [
        {
          layout: 'centered',
          blocks: [{ type: 'Caption', props: { text: 'small print' } }],
        },
      ],
    },
    'legibility.spec.json',
  );

describe('checkLegibility', () => {
  /**
   * The failure it exists for: a store gallery shows the asset at a fraction of full size, so
   * app-viewport type disappears. The render succeeds, dimensions validate, and it uploads.
   */
  it('warns when the smallest type token is a tiny fraction of the canvas', () => {
    const [violation, ...rest] = checkLegibility(
      spec('ios-6.9'),
      registries,
      tokens,
      'legibility.spec.json',
    );
    expect(rest).toHaveLength(0);
    expect(violation?.preset).toBe('ios-6.9');
    expect(violation?.message).toContain('type.caption');
    expect(violation?.message).toMatch(/Raise tokens\.scale to about [\d.]+/);
  });

  /**
   * A warning rather than an error: the display width of a store gallery is not published, so
   * failing a build on it would claim more certainty than exists. `check --strict` promotes it.
   */
  it('reports at warning severity', () => {
    const [violation] = checkLegibility(spec('ios-6.9'), registries, tokens, 'f.json');
    expect(violation?.severity).toBe('warning');
  });

  /** Scoped to presets something is uploaded to. A social preset has no rejection risk. */
  it('says nothing about a preset with no channel constraints', () => {
    expect(checkLegibility(spec('ig-portrait'), registries, tokens, 'f.json')).toEqual([]);
  });

  it('says nothing once the scale is raised past the floor', () => {
    expect(
      checkLegibility(spec('ios-6.9'), registries, { ...tokens, scale: 8 }, 'f.json'),
    ).toEqual([]);
  });

  it('reports once per preset a spec fans out across', () => {
    const violations = checkLegibility(
      spec(['ios-6.9', 'play-phone', 'ig-portrait']),
      registries,
      tokens,
      'f.json',
    );
    expect(violations.map((v) => v.preset)).toEqual(['ios-6.9', 'play-phone']);
  });

  it('ignores a preset the spec names that is not registered', () => {
    expect(checkLegibility(spec('nope-9000'), registries, tokens, 'f.json')).toEqual([]);
  });
});
