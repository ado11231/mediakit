import type { AssetSpec } from '../spec/schema.js';
import { Registry } from './registry.js';

/**
 * A recipe that writes a complete spec.
 *
 * `init` scaffolds a three-block example, which proves the pipeline works and is nothing like
 * the thing anyone actually came for. A five-frame store listing or a six-frame carousel is
 * authored by hand today, structure and all, and structure is the part a person has no opinion
 * about the first time: they know what the frames should say, not which layout arranges them.
 *
 * A template closes that gap by generating the structure and leaving placeholders where the
 * copy goes, so the only thing left to edit is the strings. It writes a file rather than
 * resolving at render time on purpose. A generated spec that gets committed and diffed is the
 * "assets as code" promise; a spec assembled invisibly at render time from a copy file is a
 * second, hidden source of truth, and invariant 11's argument against clever renders applies
 * to it exactly.
 *
 * The fourth registry, and open for the same reason as the other three: a consumer whose
 * carousel always opens with a title card and closes with a CTA should register that shape
 * once rather than retype it.
 */
/** A canvas the generated spec will be rendered onto, resolved from the preset registry. */
export interface TemplateCanvas {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A rendered screen to place inside a device frame. Its dimensions travel with it because a
 * template has to size the device to fit the canvas, and `DeviceFrame` sizes to a PNG's
 * intrinsic dimensions when it is not told otherwise: a 1320x2868 screen dropped on a 1080x1920
 * canvas pushes the headline clean off it, and every frame then renders identically.
 */
export interface TemplateScreen {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface TemplateContext {
  /** The spec id, which is also the output directory name under `marketing/`. */
  readonly id: string;
  readonly presets: readonly string[];
  /** The same presets with their dimensions, so a template can size content to the canvas. */
  readonly canvases: readonly TemplateCanvas[];
  readonly frames: number;
  /**
   * Absent means the template must emit something that renders immediately, since `init` and
   * `new` both promise a project that renders on the first run.
   */
  readonly screen?: TemplateScreen | undefined;
}

export interface TemplateDefinition {
  /** One line, shown by `mediakit new --help` and when a name does not resolve. */
  readonly description: string;
  /** Where this shape belongs, used when `--preset` is absent. */
  readonly presets: readonly string[];
  readonly frames: { readonly min: number; readonly max: number; readonly default: number };
  /** True when the shape is only meaningful around a screenshot. */
  readonly wantsScreen?: boolean;
  readonly build: (context: TemplateContext) => AssetSpec;
}

export const defineTemplate = (definition: TemplateDefinition): TemplateDefinition =>
  definition;

export const createTemplateRegistry = (): Registry<TemplateDefinition> =>
  new Registry<TemplateDefinition>('template');
