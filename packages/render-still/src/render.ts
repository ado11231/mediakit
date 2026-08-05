import { Resvg } from '@resvg/resvg-js';
import satori, { type SatoriOptions } from 'satori';
import {
  assertSlot,
  colorToken,
  MediakitError,
  resolveTokens,
  type AssetSpec,
  type Element,
  type FrameSpec,
  type Preset,
  type Registries,
  type RenderContext,
  type ResolvedTokens,
  type SpecLocation,
  type TokensInput,
} from '@mediakit/core';
import { h } from '@mediakit/core';
import { loadFonts, type LoadedFont } from './fonts.js';

export interface RenderSpecOptions {
  spec: AssetSpec;
  registries: Registries;
  tokens: TokensInput;
  /** Which registered preset to render. Fan-out across a spec's presets is the caller's loop. */
  preset: string;
  /** Named in every thrown message, so errors point at a file rather than at a spec object. */
  file: string;
}

export interface RenderedFrame {
  index: number;
  png: Buffer;
  svg: string;
}

/**
 * satori declares its first parameter as React's `ReactNode`. mediakit does not depend on
 * React, so that type currently resolves to `any` and any element would be accepted, which
 * is silent and brittle: installing `@types/react` anywhere in the tree would turn it into a
 * real type and break this call.
 *
 * Restating the signature mediakit actually relies on makes the contract explicit and stable
 * either way. satori accepts plain `{type, props}` objects at runtime, verified by the M0
 * spike, and this is the single point where that assumption is stated.
 */
const renderToSvg = satori as unknown as (
  element: Element,
  options: SatoriOptions,
) => Promise<string>;

const renderBlocks = (
  frame: FrameSpec,
  registries: Registries,
  context: RenderContext,
  base: SpecLocation,
): { blocks: Element[]; slots: Record<string, Element[]> } => {
  const layoutName = frame.layout;
  const layout = registries.layouts.get(layoutName, base);

  const blocks: Element[] = [];
  const slots: Record<string, Element[]> = {};
  for (const slot of layout.slots) slots[slot] = [];

  frame.blocks.forEach((block, blockIndex) => {
    const location: SpecLocation = { ...base, blockIndex, blockType: block.type };
    const entry = registries.blocks.get(block.type, location);
    const render = entry.still;

    if (render === undefined) {
      throw new MediakitError(
        `The block "${block.type}" has no still renderer, so it cannot be rendered to PNG` +
          `${locationSuffix(location)}. Add a \`still\` renderer to its definition.`,
      );
    }

    assertSlot(layoutName, layout, block.slot, location);

    const element = render(block.props, context, location);
    blocks.push(element);
    if (block.slot !== undefined) slots[block.slot]?.push(element);
  });

  return { blocks, slots };
};

const locationSuffix = (location: SpecLocation): string =>
  ` in ${location.file ?? 'spec'}, frame ${location.frameIndex ?? 0}`;

/**
 * The canvas root is owned by the renderer, not by the layout. Layouts arrange content and
 * would otherwise each have to restate the preset's exact pixel dimensions, which is the one
 * place a wrong number produces an asset a store silently rejects.
 */
const canvas = (preset: Preset, background: string, content: Element): Element =>
  h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: preset.width,
        height: preset.height,
        backgroundColor: background,
      },
    },
    content,
  );

const renderFrame = async (
  frame: FrameSpec,
  frameIndex: number,
  spec: AssetSpec,
  registries: Registries,
  tokens: ResolvedTokens,
  preset: Preset,
  fonts: readonly LoadedFont[],
  file: string,
): Promise<RenderedFrame> => {
  const location: SpecLocation = { file, frameIndex };
  const context: RenderContext = {
    tokens,
    preset,
    frameIndex,
    frameCount: spec.frames.length,
    frames: registries.frames,
  };

  const layout = registries.layouts.get(frame.layout, location);
  const arrange = layout.still;
  if (arrange === undefined) {
    throw new MediakitError(
      `The layout "${frame.layout}" has no still renderer, so it cannot be rendered to PNG` +
        `${locationSuffix(location)}. Add a \`still\` renderer to its definition.`,
    );
  }

  const { blocks, slots } = renderBlocks(frame, registries, context, location);
  const background = colorToken(tokens, frame.background ?? 'canvas', location);

  const svg = await renderToSvg(
    canvas(preset, background, arrange({ blocks, slots }, context)),
    { width: preset.width, height: preset.height, fonts: [...fonts] },
  );

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: preset.width },
    // Apple rejects screenshots carrying an alpha channel, and a transparent PNG is
    // indistinguishable from an opaque one until upload. Compositing on the frame's own
    // background makes the output opaque without changing how it looks.
    background,
  })
    .render()
    .asPng();

  return { index: frameIndex, png, svg };
};

export const renderSpec = async (options: RenderSpecOptions): Promise<RenderedFrame[]> => {
  const { spec, registries, file } = options;
  const preset = registries.presets.get(options.preset, { file });
  const tokens = resolveTokens(options.tokens, preset.scale);
  const fonts = await loadFonts(tokens);

  const frames: RenderedFrame[] = [];
  for (const [frameIndex, frame] of spec.frames.entries()) {
    frames.push(
      await renderFrame(frame, frameIndex, spec, registries, tokens, preset, fonts, file),
    );
  }

  return frames;
};
