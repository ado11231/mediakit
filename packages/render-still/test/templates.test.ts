import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  BUILTIN_BLOCKS,
  BUILTIN_FRAMES,
  BUILTIN_LAYOUTS,
  BUILTIN_TEMPLATES,
} from '@mediakit/blocks/defaults';
import {
  applyConfig,
  createDefaultRegistries,
  parseSpec,
  type Registries,
  type TemplateContext,
  type TokensInput,
} from '@mediakit/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderSpec } from '../src/index.js';

const tokens: TokensInput = { color: { accent: '#2563EB' } };

const registries = (): Registries =>
  applyConfig(createDefaultRegistries(), {
    tokens,
    blocks: BUILTIN_BLOCKS,
    layouts: BUILTIN_LAYOUTS,
    frames: BUILTIN_FRAMES,
    templates: BUILTIN_TEMPLATES,
  });

/**
 * A small square canvas rather than the listing sizes the templates propose. What is under
 * test is the shape a template emits, not the size it proposes, and a 1080x1080 render is a
 * fraction of the cost of a 1320x2868 one.
 */
const CANVAS = { name: 'ig-square', width: 1080, height: 1080 };

const context = (overrides: Partial<TemplateContext> = {}): TemplateContext => ({
  id: 'fixture',
  presets: [CANVAS.name],
  canvases: [CANVAS],
  frames: 3,
  ...overrides,
});

const render = async (spec: ReturnType<typeof parseSpec>) =>
  renderSpec({
    spec,
    registries: registries(),
    tokens,
    preset: CANVAS.name,
    file: 'fixture.spec.json',
  });

const sha = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

describe('built-in templates', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mediakit-templates-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('every template emits a spec that parses', () => {
    for (const name of Object.keys(BUILTIN_TEMPLATES)) {
      const template = BUILTIN_TEMPLATES[name];
      const spec = template?.build(context({ frames: template.frames.default }));
      expect(() => parseSpec(spec, `${name}.spec.json`)).not.toThrow();
    }
  });

  /**
   * The rule in CLAUDE.md, and it earned its place again here: the listing template shipped
   * for one afternoon sizing its device frame to the screen's intrinsic pixels, so a 1320x2868
   * render dropped on a 1080x1920 canvas pushed the headline off it and every frame came out
   * byte-identical. The specs were structurally distinct the whole time, so nothing but hashing
   * the output could have caught it.
   */
  it('renders a carousel to distinct bytes per frame', async () => {
    const spec = parseSpec(
      BUILTIN_TEMPLATES['carousel']?.build(context({ frames: 3 })),
      'carousel.spec.json',
    );
    const frames = await render(spec);
    expect(new Set(frames.map((f) => sha(f.png))).size).toBe(3);
  });

  it('renders a listing to distinct bytes per frame, with the screen framed inside it', async () => {
    const screenSpec = parseSpec(
      BUILTIN_TEMPLATES['screen']?.build(context({ frames: 1, presets: [CANVAS.name] })),
      'screen.spec.json',
    );
    const [rendered] = await render(screenSpec);
    const screenPath = join(dir, 'screen.png');
    await writeFile(screenPath, rendered?.png ?? Buffer.alloc(0));

    const spec = parseSpec(
      BUILTIN_TEMPLATES['listing']?.build(
        context({
          frames: 2,
          screen: { path: screenPath, width: CANVAS.width, height: CANVAS.height },
        }),
      ),
      'listing.spec.json',
    );

    const frames = await render(spec);
    expect(frames).toHaveLength(2);
    expect(new Set(frames.map((f) => sha(f.png))).size).toBe(2);
  });

  /**
   * `new` promises what `init` promises: a project that renders on the first run. A listing
   * with no screen yet must therefore emit something renderable rather than a `DeviceFrame`
   * pointing at a file nobody has produced, which throws when it reads the path.
   */
  it('renders a listing that has no screen yet', async () => {
    const spec = parseSpec(
      BUILTIN_TEMPLATES['listing']?.build(context({ frames: 1 })),
      'listing.spec.json',
    );
    const frames = await render(spec);
    expect(frames).toHaveLength(1);
  });
});
