import { colorToken, type Element, type RenderContext, type Style } from '@mediakit/core';

const num = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;

export interface PhoneChrome {
  /** `undefined` when the screen declared no numeric width, which fixes the fallback sizes. */
  screenWidth: number | undefined;
  bezel: number;
  device: Style;
  screen: Style;
}

/**
 * The bezel geometry `phone` and `phone-notch` share. It sits here rather than in `frames/`
 * because `exports` publishes that directory wholesale as `@mediakit/blocks/frame/*`, and a
 * shared helper is not something to promise a consumer. `style.ts` is here for the same reason.
 *
 * The geometry is sized proportionally to the screen content rather than to a fixed
 * design-system number. A listing screenshot is framed inside a
 * 1320x2868 canvas while a social slide frames the same image at a quarter the width, so a
 * bezel authored at one scale is wrong at the other. Reading the child's resolved width keeps
 * the chrome honest at any size.
 */
export const phoneChrome = (child: Element, context: RenderContext): PhoneChrome => {
  const screenWidth = num(child.props.style?.width);
  const bezel = screenWidth === undefined ? 12 : Math.round(screenWidth * 0.04);
  const radius = screenWidth === undefined ? 44 : Math.round(screenWidth * 0.18);
  const shell = colorToken(context.tokens, 'bezel');

  return {
    screenWidth,
    bezel,
    device: {
      display: 'flex',
      position: 'relative',
      backgroundColor: shell,
      padding: bezel,
      borderRadius: radius + bezel,
      boxShadow: `0 ${Math.round(bezel * 1.5)}px ${Math.round(bezel * 3)}px rgba(0,0,0,0.45)`,
    },
    screen: {
      display: 'flex',
      overflow: 'hidden',
      borderRadius: radius,
    },
  };
};
