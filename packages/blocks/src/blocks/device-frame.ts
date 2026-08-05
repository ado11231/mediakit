import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { defineBlock, MediakitError, h } from '@mediakit/core';
import { z } from 'zod';

const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Reads a screenshot from disk and inlines it as a data URI, because satori fetches image
 * `src` values over the network and mediakit makes zero network requests at any point in its
 * lifecycle (invariant 8). The path is a declared input of the render, so reading it here is
 * deterministic, and doing the read in the block keeps image loading out of the render loop
 * the way font loading is out of `render-still`'s hot path.
 */
const inline = (src: string): { dataUri: string; bytes: Buffer } => {
  if (src.startsWith('data:')) return { dataUri: src, bytes: Buffer.alloc(0) };
  const bytes = readFileSync(src);
  const mime = MIME[extname(src).toLowerCase()] ?? 'image/png';
  return { dataUri: `data:${mime};base64,${bytes.toString('base64')}`, bytes };
};

/** PNG IHDR carries width and height at a fixed offset, so no image library is needed. */
const pngDimensions = (bytes: Buffer): { width: number; height: number } | undefined => {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return undefined;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

/**
 * One block with a `chrome` prop rather than a block per device. `chrome` is an open string
 * resolved against the frame registry at render time, so a watch or a bezel-less variant is a
 * registration rather than another block. `phone` `tablet` `browser` `none` ship as defaults
 * from `@mediakit/blocks`.
 *
 * `width` and `height` size the screen content in canvas pixels. Omitting them reads the
 * intrinsic dimensions from a PNG header, so a spec can frame a screenshot without doing
 * arithmetic, and the device chrome scales proportionally to the resolved size.
 */
export const DeviceFrame = defineBlock({
  schema: z.object({
    chrome: z.string().default('none'),
    src: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  still: (props, context) => {
    const { dataUri, bytes } = inline(props.src);
    const intrinsic =
      props.width !== undefined && props.height !== undefined
        ? { width: props.width, height: props.height }
        : pngDimensions(bytes);
    if (intrinsic === undefined) {
      throw new MediakitError(
        `DeviceFrame could not determine dimensions for "${props.src}". Either supply width and height, or use a PNG whose IHDR can be read.`,
      );
    }

    const img = h('img', {
      src: dataUri,
      style: { width: intrinsic.width, height: intrinsic.height },
    });

    const frame = context.frames.get(props.chrome);
    const render = frame.still;
    if (render === undefined) {
      throw new MediakitError(
        `The frame "${props.chrome}" has no still renderer, so it cannot frame a screenshot.`,
      );
    }
    return render(img, context);
  },
});
