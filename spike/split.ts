import { h, type Element } from './h.ts';
import { palette, font } from './palette.ts';
import { DeviceFrame, deviceGeometry } from './device-frame.ts';
import { ListScreen } from './screen.ts';

export const CANVAS = { width: 1080, height: 1350 } as const;

const PADDING = 72;
const GUTTER = 56;
const DEVICE_WIDTH = 400;

const bullet = (label: string): Element =>
  h(
    'div',
    { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 },
    h(
      'div',
      {
        display: 'flex',
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: palette.accent,
      },
    ),
    h('div', { fontFamily: font.body, fontSize: 24, color: palette.inkMuted }, label),
  );

const copyColumn = (): Element =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      flexBasis: 0,
      justifyContent: 'center',
      gap: 20,
    },
    h(
      'div',
      {
        fontFamily: font.body,
        fontSize: 18,
        fontWeight: 600,
        color: palette.accent,
        textTransform: 'uppercase',
        letterSpacing: 2.4,
      },
      'Assets as code',
    ),
    h(
      'div',
      {
        fontFamily: font.body,
        fontSize: 62,
        fontWeight: 700,
        lineHeight: 1.05,
        color: palette.ink,
        letterSpacing: -1.6,
      },
      'Every screenshot, rebuilt on commit',
    ),
    h(
      'div',
      { fontFamily: font.body, fontSize: 24, lineHeight: 1.45, color: palette.inkMuted },
      'Render store images and social posts from your own design tokens, with no browser in the loop.',
    ),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 },
      bullet('Deterministic, byte for byte'),
      bullet('Runs anywhere CI runs'),
      bullet('Reviewable in a pull request'),
    ),
  );

export const SplitFrame = (): Element =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: GUTTER,
      width: CANVAS.width,
      height: CANVAS.height,
      padding: PADDING,
      backgroundColor: palette.canvas,
      // A gradient must live in backgroundImage; satori ignores it in the
      // `background` shorthand (CLAUDE.md, satori constraints).
      backgroundImage: `linear-gradient(150deg, ${palette.canvas} 0%, ${palette.canvasAccent} 100%)`,
    },
    copyColumn(),
    h(
      'div',
      { display: 'flex', alignItems: 'center', justifyContent: 'center' },
      DeviceFrame({
        width: DEVICE_WIDTH,
        bezelColor: palette.bezel,
        screenColor: palette.screen,
        screen: ListScreen(deviceGeometry(DEVICE_WIDTH).notchHeight),
      }),
    ),
  );
