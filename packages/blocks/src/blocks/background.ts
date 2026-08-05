import { colorToken, defineBlock, h, type Style } from '@mediakit/core';
import { z } from 'zod';

/**
 * A full-canvas background layer: a solid colour or a two-stop gradient, resolved through the
 * token contract so a brand change is one edit in the config rather than a per-spec hex.
 *
 * Renders absolutely positioned and anchored to the render canvas, so it paints behind every
 * other block regardless of the frame's layout. This is why the render-still canvas root sets
 * `position: 'relative'`: an absolutely positioned child anchors to the nearest positioned
 * ancestor, and without that the background would anchor to the SVG viewport instead.
 *
 * A solid `color` and a `gradient` are mutually exclusive. Gradients go in `backgroundImage`
 * rather than the `background` shorthand, per satori's subset.
 */
export const Background = defineBlock({
  schema: z
    .object({
      color: z.string().optional(),
      gradient: z
        .object({ from: z.string(), to: z.string(), angle: z.number().optional() })
        .optional(),
    })
    .refine((props) => props.color !== undefined || props.gradient !== undefined, {
      message: 'Background needs either `color` or `gradient`',
    }),
  still: (props, { tokens }) => {
    const style: Style & { backgroundImage?: string; backgroundColor?: string } =
      props.gradient !== undefined
        ? {
            backgroundImage: `linear-gradient(${props.gradient.angle ?? 135}deg, ${colorToken(tokens, props.gradient.from)}, ${colorToken(tokens, props.gradient.to)})`,
          }
        : { backgroundColor: colorToken(tokens, props.color ?? 'canvas') };
    return h('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        ...style,
      },
    });
  },
});
