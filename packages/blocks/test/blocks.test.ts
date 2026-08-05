import {
  resolveTokens,
  type Preset,
  type RenderContext,
  type Element,
  type BlockEntry,
} from '@mediakit/core';
import { describe, expect, it } from 'vitest';
import { Body } from '../src/blocks/body.js';
import { BulletList } from '../src/blocks/bullet-list.js';
import { Caption } from '../src/blocks/caption.js';
import { CTA } from '../src/blocks/cta.js';
import { Eyebrow } from '../src/blocks/eyebrow.js';
import { Headline } from '../src/blocks/headline.js';
import { Stat } from '../src/blocks/stat.js';
import { Subhead } from '../src/blocks/subhead.js';
import { BUILTIN_BLOCKS, BUILTIN_LAYOUTS } from '../src/defaults.js';

const preset: Preset = { width: 1080, height: 1350, renderer: 'still', scale: 2.5 };

const context: RenderContext = {
  tokens: resolveTokens({ color: { accent: '#2563EB' } }, preset.scale),
  preset,
  frameIndex: 0,
  frameCount: 1,
};

const render = (block: BlockEntry, props: unknown): Element => {
  const still = block.still;
  if (still === undefined) throw new Error('block must declare a still renderer');
  return still(props, context);
};

describe('blocks read tokens rather than hardcoding style', () => {
  it('resolves colour through the token contract', () => {
    const element = render(Headline, { text: 'Ship it' });

    expect(element.props.style?.color).toBe(context.tokens.color.ink);
  });

  it('applies the scaled font size, not the raw design-system value', () => {
    const element = render(Headline, { text: 'Ship it' });

    // 34 authored at design-system scale, 2.5 from the preset.
    expect(element.props.style?.fontSize).toBe(85);
  });

  it('lets an open string point a block at any registered type token', () => {
    const display = render(Headline, { text: 'Ship it' });
    const caption = render(Headline, { text: 'Ship it', size: 'caption' });

    expect(caption.props.style?.fontSize).not.toBe(display.props.style?.fontSize);
  });

  it('throws and lists the alternatives for a colour key that does not exist', () => {
    expect(() => render(Body, { text: 'x', color: 'accnet' })).toThrow(
      /Unknown color token "accnet"[\s\S]*accent/,
    );
  });

  it('throws for a type token that does not exist', () => {
    expect(() => render(Body, { text: 'x', size: 'gigantic' })).toThrow(
      /Unknown type token "gigantic"/,
    );
  });
});

describe('Eyebrow', () => {
  it('uppercases by default, because that is what makes it an eyebrow', () => {
    expect(render(Eyebrow, { text: 'assets as code' }).props.style?.textTransform).toBe(
      'uppercase',
    );
  });

  /**
   * `none` is emitted rather than omitted. It has to be: the type token may itself declare
   * `textTransform: 'uppercase'`, and only an explicit `none` overrides it. Omitting the
   * property here would let the token win and make the prop silently inert.
   */
  it('can be told not to, without replacing the block', () => {
    expect(
      render(Eyebrow, { text: 'assets as code', transform: 'none' }).props.style?.textTransform,
    ).toBe('none');
  });
});

describe('BulletList', () => {
  it('emits one row per item', () => {
    const element = render(BulletList, { items: ['one', 'two', 'three'] });

    expect(Array.isArray(element.props.children)).toBe(true);
    expect(element.props.children).toHaveLength(3);
  });

  it('rejects an empty list rather than rendering an invisible block', () => {
    expect(() => render(BulletList, { items: [] })).toThrow(/items/);
  });
});

describe('Subhead', () => {
  it('defaults to the headline type token and the ink color, not a muted body look', () => {
    const element = render(Subhead, { text: 'A secondary line' });
    expect(element.props.style?.fontSize).toBe(context.tokens.type.headline?.fontSize);
    expect(element.props.style?.color).toBe(context.tokens.color.ink);
  });

  it('can be pointed at a smaller token without replacing the block', () => {
    const element = render(Subhead, { text: 'x', size: 'body' });
    expect(element.props.style?.fontSize).toBe(context.tokens.type.body?.fontSize);
  });
});

describe('Stat', () => {
  it('renders the value above the label, both uppercased for the stats-slide look', () => {
    const element = render(Stat, { value: '3.2x', label: 'faster builds' });
    const children = element.props.children;
    expect(Array.isArray(children)).toBe(true);
    expect(children).toHaveLength(2);

    const value = (children as readonly Element[])[0]!;
    const label = (children as readonly Element[])[1]!;
    expect(value.props.style?.textTransform).toBe('uppercase');
    expect(label.props.style?.textTransform).toBe('uppercase');
    expect(value.props.style?.color).toBe(context.tokens.color.ink);
    expect(label.props.style?.color).toBe(context.tokens.color.inkMuted);
  });

  it('aligns the column to the start, end, or center via alignItems, not text-align', () => {
    expect(
      render(Stat, { value: '1', label: 'two', align: 'right' }).props.style?.alignItems,
    ).toBe('flex-end');
  });
});

describe('CTA', () => {
  it('hugs its content via alignSelf so the pill does not stretch to the column width', () => {
    expect(render(CTA, { text: 'Get started' }).props.style?.alignSelf).toBe('flex-start');
    expect(render(CTA, { text: 'Get started', align: 'center' }).props.style?.alignSelf).toBe(
      'center',
    );
  });

  it('reads both its background and text color from the token contract', () => {
    const inner = render(CTA, { text: 'Sign up' }).props.children as Element;
    expect(inner.props.style?.backgroundColor).toBe(context.tokens.color.accent);
    expect(inner.props.style?.color).toBe(context.tokens.color.canvas);
  });

  it('resolves the radius through the token contract, not a magic number', () => {
    const inner = render(CTA, { text: 'Sign up' }).props.children as Element;
    expect(inner.props.style?.borderRadius).toBe(context.tokens.radius.full);
  });
});

describe('Caption', () => {
  it('defaults to the caption token and inkMuted, smaller and quieter than Body', () => {
    const element = render(Caption, { text: 'Source: internal' });
    expect(element.props.style?.fontSize).toBe(context.tokens.type.caption?.fontSize);
    expect(element.props.style?.color).toBe(context.tokens.color.inkMuted);
    expect(element.props.style?.fontFamily).toBe(context.tokens.font.body.family);
  });
});

describe('the default vocabulary', () => {
  it('registers only generic blocks, with no domain concept in a name', () => {
    expect(Object.keys(BUILTIN_BLOCKS).sort()).toEqual([
      'Body',
      'BulletList',
      'CTA',
      'Caption',
      'Eyebrow',
      'Headline',
      'Stat',
      'Subhead',
    ]);
  });

  it('ships all four layouts, including the two the reference never rendered', () => {
    expect(Object.keys(BUILTIN_LAYOUTS).sort()).toEqual([
      'centered',
      'fullBleed',
      'split',
      'stack',
    ]);
  });

  it('gives split two slots and leaves the others slotless', () => {
    expect(BUILTIN_LAYOUTS.split?.slots).toEqual(['left', 'right']);
    expect(BUILTIN_LAYOUTS.centered?.slots).toEqual([]);
    expect(BUILTIN_LAYOUTS.stack?.slots).toEqual([]);
    expect(BUILTIN_LAYOUTS.fullBleed?.slots).toEqual([]);
  });

  it('distributes stack vertically, which is the reference bug it exists to avoid', () => {
    const layout = BUILTIN_LAYOUTS.stack;
    const still = layout?.still;
    if (still === undefined) throw new Error('stack must declare a still renderer');

    expect(still({ blocks: [], slots: {} }, context).props.style?.justifyContent).toBe(
      'flex-end',
    );
  });
});
