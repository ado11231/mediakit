import { createHash } from 'node:crypto';
import type { Browser } from 'playwright';
import sharp from 'sharp';
import type { FontAsset, ResolvedDesign, ResolvedTypography } from './design.js';
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
  const copy = `<div class="copy" style="${side ? 'flex:1;min-width:0;' : ''}"><h1 data-check="headline" style="${typographyCss(design.headline)}${positionCss(slide.positions?.headline)}">${escapeHtml(slide.headline)}</h1>${slide.body && design.body ? `<p data-check="body" style="${typographyCss(design.body)}color:${escapeHtml(design.secondaryText ?? design.text)};${positionCss(slide.positions?.body)}">${escapeHtml(slide.body)}</p>` : ''}</div>`;
  const image = capture
    ? `<div id="screen-space" style="${side ? 'flex:1;width:0;height:100%;' : 'flex:1;min-height:0;width:100%;'}${positionCss(slide.positions?.screen)}"><div id="device" data-check="screen" style="background:${slide.bezel === 'silver' ? '#c9cbce' : '#121212'}"><img id="screen-image" alt="" src="data:image/png;base64,${capture.data.toString('base64')}" /></div></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss(fonts)}
@page{size:${output.width}px ${output.height}px;margin:0}
*{box-sizing:border-box}html,body{margin:0;width:${output.width}px;height:${output.height}px;background:${escapeHtml(design.background)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
main{position:relative;display:flex;flex-direction:${side ? 'row' : 'column'};justify-content:${capture ? 'flex-start' : 'center'};align-items:stretch;width:100%;height:100%;padding:${design.padding}px;gap:${design.gap}px;color:${escapeHtml(design.text)};text-align:${slide.align ?? (side ? 'left' : 'center')}}
.copy{display:flex;flex-direction:column;gap:${design.gap}px;flex-shrink:0}h1,p{margin:0;white-space:pre-wrap;overflow-wrap:normal;flex-shrink:0}#screen-space{display:flex;align-items:center;justify-content:center;min-width:0}#device{flex-shrink:0;box-sizing:content-box;overflow:hidden}#screen-image{display:block;width:100%;height:100%;object-fit:contain}
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
      ({ width, height, device, fontStyles, background }) => {
        for (const font of fontStyles)
          if (!document.fonts.check(`${font.weight} ${font.size}px ${font.family}`))
            throw new Error(`Font did not load: ${font.family} weight ${font.weight}.`);
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not validate background.');
        context.fillStyle = background;
        context.fillRect(0, 0, 1, 1);
        if (context.getImageData(0, 0, 1, 1).data[3] !== 255)
          throw new Error('Background must be opaque for export.');
        const space = document.getElementById('screen-space');
        const frame = document.getElementById('device');
        const image = document.getElementById('screen-image');
        if (space && frame && image instanceof HTMLImageElement) {
          const borderRatio = device === 'iphone' ? 0.025 : 0;
          const ratio = image.naturalWidth / image.naturalHeight;
          const screenWidth = Math.min(
            space.clientWidth / (1 + 2 * borderRatio),
            space.clientHeight / (1 / ratio + 2 * borderRatio),
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
          frame.style.width = `${screenWidth}px`;
          frame.style.height = `${screenHeight}px`;
          frame.style.border = `${screenWidth * borderRatio}px solid ${getComputedStyle(frame).backgroundColor}`;
          frame.style.borderRadius = `${device === 'iphone' ? screenWidth * 0.12 : 0}px`;
          image.style.borderRadius = `${device === 'iphone' ? screenWidth * 0.095 : 0}px`;
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
        background: design.background,
        fontStyles: [design.headline, ...(design.body ? [design.body] : [])].map((style) => ({
          ...style,
          family: fontName(style.font),
        })),
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
