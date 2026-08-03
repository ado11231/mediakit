import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertSlot,
  createDefaultRegistries,
  defineBlock,
  defineLayout,
  h,
  MediakitError,
  parseSpec,
  type LayoutDefinition,
} from '../src/index.js';

/**
 * One test per row of the failure table in CLAUDE.md that core owns. The remaining rows
 * (missing config, render before config load, unloaded font weight) belong to the CLI and
 * render-still and are tested there.
 *
 * These assert the message content, not just that something threw. The value of these
 * errors is entirely in what they tell a consumer to do next, so a test that only checks
 * `toThrow()` would pass against "invalid spec" and defeat the point.
 */

const textBlock = defineBlock({
  schema: z.object({ text: z.string(), weight: z.number() }),
  still: (props) => h('div', null, props.text),
});

describe('duplicate registration', () => {
  it('names the block and both registration sites', () => {
    const { blocks } = createDefaultRegistries();
    blocks.register('Headline', textBlock);

    try {
      blocks.register('Headline', textBlock);
      expect.unreachable('expected a duplicate registration to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MediakitError);
      const { message } = error as MediakitError;
      expect(message).toContain('"Headline" is registered twice');
      expect(message).toContain('first:');
      expect(message).toContain('second:');
      expect(message).toContain('failure-table.test.ts');
    }
  });

  it('applies to layouts on the same terms', () => {
    const { layouts } = createDefaultRegistries();
    const split = defineLayout({ slots: ['left', 'right'] });
    layouts.register('split', split);

    expect(() => {
      layouts.register('split', split);
    }).toThrow(/"split" is registered twice/);
  });
});

describe('unknown registry keys', () => {
  it('lists the registered presets', () => {
    const { presets } = createDefaultRegistries();

    try {
      presets.get('ig-portriat', { file: 'marketing/launch.spec.json' });
      expect.unreachable('expected an unknown preset to throw');
    } catch (error) {
      const { message } = error as MediakitError;
      expect(message).toContain('Unknown preset "ig-portriat"');
      expect(message).toContain('marketing/launch.spec.json');
      expect(message).toContain('ig-portrait');
      expect(message).toContain('story');
    }
  });

  it('lists the registered block types and names the frame', () => {
    const { blocks } = createDefaultRegistries();
    blocks.register('Headline', textBlock);
    blocks.register('Eyebrow', textBlock);

    try {
      blocks.get('Headlien', { file: 'launch.spec.json', frameIndex: 2 });
      expect.unreachable('expected an unknown block type to throw');
    } catch (error) {
      const { message } = error as MediakitError;
      expect(message).toContain('Unknown block "Headlien"');
      expect(message).toContain('frame 2');
      expect(message).toContain('Eyebrow');
      expect(message).toContain('Headline');
    }
  });

  it('lists the registered layouts', () => {
    const { layouts } = createDefaultRegistries();
    layouts.register('split', defineLayout({ slots: ['left', 'right'] }));

    expect(() => layouts.get('splitt')).toThrow(/Unknown layout "splitt"/);
  });

  it('sorts the listed names so the message is identical across runs', () => {
    const { blocks } = createDefaultRegistries();
    for (const name of ['Stat', 'CTA', 'Headline', 'Body']) blocks.register(name, textBlock);

    expect(blocks.names()).toEqual(['Body', 'CTA', 'Headline', 'Stat']);
  });
});

describe('block props failing their schema', () => {
  it('reports every failing field at once rather than the first', () => {
    const entry = textBlock;
    const still = entry.still;
    if (still === undefined) throw new Error('fixture must declare a still renderer');

    try {
      still({ text: 42, weight: 'bold' }, {} as never, {
        file: 'launch.spec.json',
        frameIndex: 1,
        blockIndex: 0,
        blockType: 'Headline',
      });
      expect.unreachable('expected invalid props to throw');
    } catch (error) {
      const { message } = error as MediakitError;
      expect(message).toContain('launch.spec.json');
      expect(message).toContain('frame 1');
      expect(message).toContain('block 0 (Headline)');
      expect(message).toContain('text:');
      expect(message).toContain('weight:');
    }
  });

  it('passes validated, typed props through to the renderer', () => {
    const still = textBlock.still;
    if (still === undefined) throw new Error('fixture must declare a still renderer');

    expect(still({ text: 'Ship it', weight: 700 }, {} as never)).toEqual({
      type: 'div',
      props: { children: 'Ship it' },
    });
  });
});

describe('h', () => {
  /**
   * satori does not unwrap a single-element children array: `children: ['text']` counts as
   * more than one child and throws "Expected <div> to have explicit display: flex" on markup
   * that visibly has one child. Collapsing here is the fix, and it is easy to undo by
   * accident while tidying, which is why it is asserted rather than only commented.
   */
  it('collapses a lone child to a scalar, because satori counts a one-element array as many', () => {
    expect(h('div', null, 'solo').props.children).toBe('solo');
  });

  it('keeps multiple children as an array', () => {
    expect(h('div', null, 'a', 'b').props.children).toEqual(['a', 'b']);
  });

  it('drops absent children so a conditional does not become a phantom second child', () => {
    expect(h('div', null, 'a', false, null, undefined).props.children).toBe('a');
  });
});

describe('slots', () => {
  const split: LayoutDefinition = { slots: ['left', 'right'] };
  const centered: LayoutDefinition = { slots: [] };

  it('names the layout and lists the slots it does declare', () => {
    try {
      assertSlot('split', split, 'middle', { file: 'launch.spec.json', frameIndex: 3 });
      expect.unreachable('expected an undeclared slot to throw');
    } catch (error) {
      const { message } = error as MediakitError;
      expect(message).toContain('The layout "split" does not declare a slot "middle"');
      expect(message).toContain('frame 3');
      expect(message).toContain('left');
      expect(message).toContain('right');
    }
  });

  it('rejects a slot on a layout that declares none', () => {
    expect(() => {
      assertSlot('centered', centered, 'right');
    }).toThrow(/declares no slots, but a block sets slot "right"/);
  });

  it('rejects a missing slot on a layout that declares some', () => {
    expect(() => {
      assertSlot('split', split, undefined);
    }).toThrow(/declares slots, so every block must name one/);
  });

  it('accepts a declared slot, and an absent slot on a slotless layout', () => {
    expect(() => {
      assertSlot('split', split, 'left');
    }).not.toThrow();
    expect(() => {
      assertSlot('centered', centered, undefined);
    }).not.toThrow();
  });
});

describe('spec parsing', () => {
  it('names the file and reports every invalid field at once', () => {
    try {
      parseSpec({ id: 'Launch Post', preset: 'ig-portrait', frames: [] }, 'launch.spec.json');
      expect.unreachable('expected an invalid spec to throw');
    } catch (error) {
      const { message } = error as MediakitError;
      expect(message).toContain('Invalid spec in launch.spec.json');
      expect(message).toContain('id:');
      expect(message).toContain('frames:');
    }
  });
});
