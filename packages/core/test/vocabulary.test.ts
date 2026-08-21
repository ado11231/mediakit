import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  applyConfig,
  createDefaultRegistries,
  defineBlock,
  defineLayout,
  h,
  specJsonSchema,
  vocabularyMarkdown,
  type Registries,
} from '../src/index.js';

const text = defineBlock({
  schema: z.object({ text: z.string(), align: z.enum(['left', 'center']).optional() }),
  still: () => h('div', {}),
});

type Overrides = Partial<Pick<Parameters<typeof applyConfig>[1], 'blocks' | 'layouts'>>;

const build = (extra?: Overrides): Registries =>
  applyConfig(createDefaultRegistries(), {
    tokens: { color: { accent: '#2563EB' } },
    blocks: { Headline: text },
    layouts: {
      centered: defineLayout({ slots: [], still: () => h('div', {}) }),
      split: defineLayout({ slots: ['left', 'right'], still: () => h('div', {}) }),
    },
    ...extra,
  });

const json = (registries: Registries, colors?: readonly string[]): Record<string, unknown> =>
  specJsonSchema({ registries, colors });

const defs = (schema: Record<string, unknown>): Record<string, unknown> =>
  schema['$defs'] as Record<string, unknown>;

describe('specJsonSchema', () => {
  it('enumerates every registered preset', () => {
    const properties = json(build())['properties'] as Record<string, Record<string, unknown>>;
    const first = (properties['preset']?.['oneOf'] as Record<string, unknown>[])[0];
    expect(first?.['enum']).toContain('ios-6.9');
    expect(first?.['enum']).toContain('ig-portrait');
  });

  it('gives every registered layout its own frame definition', () => {
    expect(Object.keys(defs(json(build())))).toEqual(
      expect.arrayContaining(['frame_centered', 'frame_split']),
    );
  });

  /**
   * A slot is only legal on a layout that declares it, and `assertSlot` throws in both
   * directions, so a schema that allowed `slot` on `centered` would describe a spec that
   * does not render.
   */
  it('allows slot only on a layout that declares slots', () => {
    const d = defs(json(build()));
    const centered = d['block_Headline'] as Record<string, Record<string, unknown>>;
    const split = d['block_split_Headline'] as Record<string, Record<string, unknown>>;
    expect(centered['properties']?.['slot']).toBeUndefined();
    expect((split['properties']?.['slot'] as Record<string, unknown>)['enum']).toEqual([
      'left',
      'right',
    ]);
  });

  it('enumerates colour tokens when given them, and stays open when not', () => {
    const withColors = defs(json(build(), ['accent', 'canvas']))['frame_centered'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(withColors['properties']?.['background']?.['enum']).toEqual(['accent', 'canvas']);

    const without = defs(json(build()))['frame_centered'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(without['properties']?.['background']?.['type']).toBe('string');
  });

  /**
   * Invariant 5, mechanically. The reference implementation kept a hand-edited
   * `REGISTRY_CATALOG`, so registering a block taught the generator nothing. If this passes
   * only for built-ins, the extension API is broken and nothing else would report it.
   */
  it('includes a block registered from a config, with its props', () => {
    const registries = build({
      blocks: {
        Headline: text,
        PricingCard: defineBlock({
          schema: z.object({ tier: z.string(), price: z.string() }),
          still: () => h('div', {}),
        }),
      },
    });
    const def = defs(json(registries))['block_PricingCard'] as Record<
      string,
      Record<string, unknown>
    >;
    const props = def['properties']?.['props'] as Record<string, unknown>;
    expect(Object.keys(props['properties'] as Record<string, unknown>)).toEqual([
      'tier',
      'price',
    ]);
    expect(props['required']).toEqual(['tier', 'price']);
  });

  /** A block whose schema cannot be expressed as JSON Schema must still appear. */
  it('keeps a block whose schema has no JSON Schema form', () => {
    const registries = build({
      blocks: {
        Headline: text,
        Odd: defineBlock({
          schema: z.custom<string>((v) => typeof v === 'string'),
          still: () => h('div', {}),
        }),
      },
    });
    expect(defs(json(registries))['block_Odd']).toBeDefined();
  });
});

describe('vocabularyMarkdown', () => {
  it('lists presets with their constraints, layouts with their slots, and blocks', () => {
    const md = vocabularyMarkdown({ registries: build(), colors: ['accent', 'canvas'] });
    expect(md).toContain('`ios-6.9` 1320x2868 (no alpha channel, 1-10 frames)');
    expect(md).toContain('`split` requires `slot` on every block, one of: `left`, `right`');
    expect(md).toContain('`centered` arranges blocks in order. Do not set `slot`.');
    expect(md).toContain('### Headline');
    expect(md).toContain('text: string (required)');
    expect(md).toContain('align: "left" | "center" (optional)');
    expect(md).toContain('`accent`, `canvas`');
  });
});
