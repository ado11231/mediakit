import { createHash } from 'node:crypto';
import type { Browser } from 'playwright';
import sharp from 'sharp';
import type {
  FontAsset,
  ResolvedDesign,
  ResolvedTextRun,
  ResolvedTypography,
} from './design.js';
import type { Output, Position, Slide } from './schema.js';
import type { ScreenCapture } from './capture.js';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

// Apple iPhone 16 Pro Max dimensions: 77.58 x 163.03 mm body, 2868 x 1320 px at
// 460 ppi, and a 12.45 mm outer corner radius. The titanium rim is 0.45 mm.
// https://developer.apple.com/download/files/accessories/dimensional-drawings/iphone-16-pro-max.pdf
const iphone16ProMax = {
  displayWidth: (1320 / 460) * 25.4,
  bodyWidth: 77.58,
  cornerRadius: 12.45,
  rim: 0.45,
};
function fontName(name: string): string {
  return `font-${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
}
function fontCss(fonts: Iterable<FontAsset>): string {
  return Array.from(fonts)
    .map(
      (font) =>
        `@font-face{font-family:${fontName(font.name)};src:url(data:font/ttf;base64,${font.data.toString('base64')});font-weight:${font.weight};font-style:normal;font-display:block}`,
    )
    .join('');
}
function typographyCss(style: ResolvedTypography): string {
  return `font-family:${fontName(style.font)};font-size:${style.size}px;font-weight:${style.weight};line-height:${style.lineHeight}px;letter-spacing:${style.letterSpacing}px;font-synthesis:none;`;
}
function textHtml(runs: ResolvedTextRun[]): string {
  return runs
    .map(
      (run) =>
        `<span style="${typographyCss(run)}color:${escapeHtml(run.color)}">${escapeHtml(run.text)}</span>`,
    )
    .join('');
}
function positionCss(position?: Position): string {
  return position
    ? `position:absolute;left:${position.x}px;top:${position.y}px;width:${position.width}px;height:${position.height}px;transform:rotate(${position.rotation ?? 0}deg);`
    : '';
}
export function compositionHtml(
  slide: Slide,
  output: Output,
  design: ResolvedDesign,
  fonts: Iterable<FontAsset>,
  capture?: ScreenCapture,
): string {
  const side = slide.layout === 'text-beside-device';
  const copy = `<div class="copy" style="${side ? 'flex:1;min-width:0;' : ''}"><h1 data-check="headline" style="${typographyCss(design.headline)}${positionCss(slide.positions?.headline)}">${textHtml(design.headlineRuns)}</h1>${slide.body && design.body && design.bodyRuns ? `<p data-check="body" style="${typographyCss(design.body)}${positionCss(slide.positions?.body)}">${textHtml(design.bodyRuns)}</p>` : ''}</div>`;
  const image = capture
    ? `<div id="screen-space" style="${side ? 'flex:1;width:0;height:100%;' : 'flex:1;min-height:0;width:100%;'}${positionCss(slide.positions?.screen)}"><div id="device" data-check="screen" data-device="${slide.device}" data-finish="${slide.bezel}"><div id="device-bezel"><div id="screen-clip"><img id="screen-image" alt="" src="data:image/png;base64,${capture.data.toString('base64')}" /></div></div></div></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss(fonts)}
@page{size:${output.width}px ${output.height}px;margin:0}
*{box-sizing:border-box}html,body{margin:0;width:${output.width}px;height:${output.height}px;background:${escapeHtml(design.background)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
main{position:relative;display:flex;flex-direction:${side ? 'row' : 'column'};justify-content:${capture ? 'flex-start' : 'center'};align-items:stretch;width:100%;height:100%;padding:${design.padding}px;gap:${design.gap}px;color:${escapeHtml(design.text)};text-align:${slide.align ?? (side ? 'left' : 'center')}}
.copy{display:flex;flex-direction:column;gap:${design.gap}px;flex-shrink:0}h1,p{margin:0;white-space:pre-wrap;overflow-wrap:normal;flex-shrink:0}#screen-space{display:flex;align-items:center;justify-content:center;min-width:0}#device,#device-bezel,#screen-clip{box-sizing:content-box}#device{position:relative;flex-shrink:0}#device[data-device="iphone"]{box-shadow:0 20px 48px rgba(15,23,42,.2)}#device[data-finish="black"]{background:linear-gradient(90deg,#34363a 0%,#0b0c0e 18%,#303237 50%,#0b0c0e 82%,#34363a 100%)}#device[data-finish="silver"]{background:linear-gradient(90deg,#8d9197 0%,#e6e7e9 18%,#aeb1b6 50%,#f2f2f3 82%,#8d9197 100%)}#device-bezel{background:#050505}#screen-clip{overflow:hidden}#screen-image{display:block;width:100%;height:100%;object-fit:contain}
</style></head><body><main>${copy}${image}</main></body></html>`;
}
export interface RenderedSlide {
  png: Buffer;
  pdf?: Buffer;
}
export async function renderSlide(
  browser: Browser,
  slide: Slide,
  output: Output,
  design: ResolvedDesign,
  fonts: Iterable<FontAsset>,
  capture?: ScreenCapture,
): Promise<RenderedSlide> {
  const page = await browser.newPage({
    viewport: { width: output.width, height: output.height },
    deviceScaleFactor: 1,
  });
  try {
    await page.route('**/*', (route) => route.abort());
    await page.setContent(compositionHtml(slide, output, design, fonts, capture));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.decode()));
    });
    await page.evaluate(
      ({ width, height, device, iphone, fontStyles, background }) => {
        for (const font of fontStyles)
          if (!document.fonts.check(`${font.weight} ${font.size}px ${font.family}`))
            throw new Error(`Font did not load: ${font.family} weight ${font.weight}.`);
        const backgroundElement = document.createElement('div');
        backgroundElement.style.background = background;
        if (!backgroundElement.style.background)
          throw new Error('Could not validate background.');
        const space = document.getElementById('screen-space');
        const frame = document.getElementById('device');
        const bezel = document.getElementById('device-bezel');
        const clip = document.getElementById('screen-clip');
        const image = document.getElementById('screen-image');
        if (space && frame && bezel && clip && image instanceof HTMLImageElement) {
          const totalFrameRatio =
            device === 'iphone'
              ? (iphone.bodyWidth - iphone.displayWidth) / 2 / iphone.displayWidth
              : 0;
          const rimRatio = device === 'iphone' ? iphone.rim / iphone.displayWidth : 0;
          const ratio = image.naturalWidth / image.naturalHeight;
          const screenWidth = Math.min(
            space.clientWidth / (1 + 2 * totalFrameRatio),
            space.clientHeight / (1 / ratio + 2 * totalFrameRatio),
          );
          const screenHeight = screenWidth / ratio;
          if (screenWidth <= 0 || screenHeight <= 0)
            throw new Error('No room for the screen. Reduce copy or configure positions.');
          if (
            screenWidth > image.naturalWidth + 0.01 ||
            screenHeight > image.naturalHeight + 0.01
          )
            throw new Error(
              `Screen would be upscaled from ${image.naturalWidth}x${image.naturalHeight}. Capture at higher resolution.`,
            );
          const totalFrame = screenWidth * totalFrameRatio;
          const rim = screenWidth * rimRatio;
          const blackBezel = totalFrame - rim;
          const outerRadius =
            device === 'iphone' ? (screenWidth * iphone.cornerRadius) / iphone.displayWidth : 0;
          frame.style.padding = `${rim}px`;
          frame.style.borderRadius = `${outerRadius}px`;
          bezel.style.padding = `${blackBezel}px`;
          bezel.style.borderRadius = `${Math.max(0, outerRadius - rim)}px`;
          clip.style.width = `${screenWidth}px`;
          clip.style.height = `${screenHeight}px`;
          clip.style.borderRadius = `${Math.max(0, outerRadius - totalFrame)}px`;
        }
        const errors: string[] = [];
        const bounds = (rectangle: DOMRect, label: string) => {
          if (
            rectangle.left < -0.5 ||
            rectangle.top < -0.5 ||
            rectangle.right > width + 0.5 ||
            rectangle.bottom > height + 0.5
          )
            errors.push(`${label} extends outside the output canvas.`);
        };
        for (const element of document.querySelectorAll<HTMLElement>('[data-check]')) {
          const label = element.dataset.check ?? 'element';
          const rectangle = element.getBoundingClientRect();
          bounds(rectangle, label);
          if (label !== 'screen') {
            if (
              element.scrollWidth > element.clientWidth + 1 ||
              (element.style.height !== '' && element.scrollHeight > element.clientHeight + 1)
            )
              errors.push(`${label} overflows its text box. Edit copy, size, or placement.`);
            const range = document.createRange();
            range.selectNodeContents(element);
            for (const line of range.getClientRects()) bounds(line, label);
          }
        }
        if (errors.length) throw new Error([...new Set(errors)].join('\n'));
      },
      {
        width: output.width,
        height: output.height,
        device: slide.device,
        iphone: iphone16ProMax,
        background: design.background,
        fontStyles: [
          design.headline,
          ...design.headlineRuns,
          ...(design.body ? [design.body] : []),
          ...(design.bodyRuns ?? []),
        ].map((style) => ({ ...style, family: fontName(style.font) })),
      },
    );
    const png = await sharp(
      await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }),
    )
      .removeAlpha()
      .png()
      .toBuffer();
    if (output.format === 'pdf') {
      await page.emulateMedia({ media: 'screen' });
      const pdf = await page.pdf({
        width: `${output.width}px`,
        height: `${output.height}px`,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      return { png, pdf };
    }
    return { png };
  } finally {
    await page.close();
  }
}
