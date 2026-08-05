import { describe, expect, it } from 'vitest';
import {
  applyConfig,
  createDefaultRegistries,
  createFrameRegistry,
  defineFrame,
  MediakitError,
  h,
} from '../src/index.js';

const passthrough = defineFrame({ still: (child) => child });

describe('the frame registry', () => {
  it('is empty by default in createDefaultRegistries, since frames ship from @mediakit/blocks', () => {
    expect(createDefaultRegistries().frames.size).toBe(0);
  });

  it('resolves a registered chrome and passes the child element through it', () => {
    const frames = createFrameRegistry();
    frames.register('none', passthrough);

    const still = frames.get('none').still;
    if (still === undefined) throw new Error('none must declare a still renderer');
    const child = h('div', null, 'screen');
    const result = still(child, {} as never);
    expect(result).toBe(child);
  });

  it('throws unknownRegistryKey with the frame kind and lists what is registered', () => {
    const frames = createFrameRegistry();
    frames.register('none', passthrough);

    expect(() => frames.get('phone')).toThrow(/Unknown frame "phone"/);
    expect(() => frames.get('phone')).toThrow(/none/);
  });

  it('rejects a duplicate chrome on the same terms as blocks and layouts', () => {
    const frames = createFrameRegistry();
    frames.register('none', passthrough);

    expect(() => {
      frames.register('none', passthrough);
    }).toThrow(/"none" is registered twice/);
  });

  it('applyConfig registers frames from the config map, after built-ins', () => {
    const registries = createDefaultRegistries();
    registries.frames.register('none', passthrough);

    const custom = defineFrame({ still: (child) => h('div', null, child) });
    applyConfig(registries, {
      tokens: { color: { accent: '#000' } },
      frames: { phone: custom },
    });

    expect(registries.frames.has('phone')).toBe(true);
    expect(registries.frames.names()).toContain('none');
  });

  it('surfaces a custom frame that collides with a built-in name as a duplicateRegistration', () => {
    const registries = createDefaultRegistries();
    registries.frames.register('none', passthrough);

    expect(() => {
      applyConfig(registries, {
        tokens: { color: { accent: '#000' } },
        frames: { none: defineFrame({ still: (c) => c }) },
      });
    }).toThrow(MediakitError);
  });
});
