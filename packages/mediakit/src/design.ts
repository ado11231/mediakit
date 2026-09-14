import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser } from 'playwright';
import { create as createFont } from 'fontkit';
import { importSource } from './config.js';
import { readDesignCss } from './css.js';
import type {
  Background,
  Config,
  Design,
  Output,
  Slide,
  TextContent,
  TextSpan,
  Token,
  Typography,
} from './schema.js';

export interface ResolvedTypography {
  font: string;
  size: number;
  weight: number;
  lineHeight: number;
  letterSpacing: number;
}
export interface ResolvedTextRun extends ResolvedTypography {
  text: string;
  color: string;
}
export interface ResolvedDesign {
  background: string;
  text: string;
  secondaryText?: string;
  padding: number;
  gap: number;
  headline: ResolvedTypography;
  headlineRuns: ResolvedTextRun[];
  body?: ResolvedTypography;
  bodyRuns?: ResolvedTextRun[];
}
export interface FontAsset {
  name: string;
  weight: number;
  path: string;
  data: Buffer;
}

export function mergeDesign(...designs: (Design | undefined)[]): Design {
  return designs.reduce<Design>(
    (result, design) =>
      design
        ? {
            ...result,
            ...design,
            ...(design.headline
              ? { headline: { ...result.headline, ...design.headline } }
              : {}),
            ...(design.body ? { body: { ...result.body, ...design.body } } : {}),
          }
        : result,
    {},
  );
}
export function slideForOutput(slide: Slide, output: string): Slide {
  const override = slide.outputs?.[output];
  return {
    ...slide,
    ...override,
    design: mergeDesign(slide.design, override?.design),
    positions: { ...slide.positions, ...override?.positions },
  };
}
export class DesignResolver {
  readonly files = new Set<string>();
  readonly fonts = new Map<string, FontAsset>();
  readonly values: Record<string, string | number> = {};
  private readonly sourceValues = new Map<string, unknown>();
  private readonly validatedColors = new Set<string>();
  private readonly opaqueColors = new Set<string>();
  private readonly fontData = new Map<string, Buffer>();
  constructor(
    private readonly config: Config,
    private readonly root: string,
    private readonly browser: Browser,
  ) {}

  async resolveToken(
    token: Token | undefined,
    location: string,
    kind: 'color' | 'length' | 'number',
  ): Promise<string | number> {
    if (token === undefined)
      throw new Error(
        `${location}: required design value is missing. Configure it explicitly.`,
      );
    let value: unknown = token;
    if (typeof token === 'object') {
      const source = this.config.sources[token.source];
      if (!source) throw new Error(`${location}: unknown design source "${token.source}".`);
      const path = resolve(this.root, source.path);
      this.files.add(path);
      if (source.type === 'module') {
        if (!this.sourceValues.has(token.source))
          this.sourceValues.set(token.source, await importSource(path, source.export));
        value = this.sourceValues.get(token.source);
        for (const segment of token.token.split('.'))
          value =
            value && typeof value === 'object'
              ? (Reflect.get(value, segment) as unknown)
              : undefined;
      } else {
        const result = await readDesignCss(path);
        result.files.forEach((file) => this.files.add(file));
        const page = await this.browser.newPage({ colorScheme: source.mode });
        try {
          await page.route('**/*', (route) => route.abort());
          await page.setContent(
            '<!doctype html><html><body><div id="token-target"></div></body></html>',
          );
          await page.addStyleTag({ content: result.css });
          value = await page.evaluate(
            ({ selector, tokenName, kind }) => {
              // Complex selectors need a compiled source with a matching root selector.
              if (selector !== ':root' && selector !== 'html') {
                if (/^\.[\w-]+$/.test(selector))
                  document.documentElement.classList.add(selector.slice(1));
                else {
                  const attribute = /^\[([\w-]+)(?:=["']?([\w-]+)["']?)?\]$/.exec(selector);
                  if (!attribute?.[1])
                    throw new Error(
                      `Unsupported theme selector ${selector}. Use :root, .class, or [attribute=value].`,
                    );
                  document.documentElement.setAttribute(attribute[1], attribute[2] ?? '');
                }
              }
              const target = document.getElementById('token-target');
              if (!target) throw new Error('Missing token target.');
              const raw = getComputedStyle(target).getPropertyValue(tokenName).trim();
              if (!raw)
                throw new Error(
                  `CSS token ${tokenName} is missing or cyclic under ${selector}.`,
                );
              if (kind === 'number') return Number(raw);
              const property = kind === 'color' ? 'color' : 'margin-left';
              if (!CSS.supports(property, raw))
                throw new Error(`${tokenName}: invalid ${kind}: ${raw}`);
              target.style.setProperty(property, `var(${tokenName})`);
              return getComputedStyle(target).getPropertyValue(property);
            },
            { selector: source.selector, tokenName: token.token, kind },
          );
        } finally {
          await page.close();
        }
      }
    }
    if (kind === 'color') {
      if (typeof value !== 'string') throw new Error(`${location}: expected a color.`);
      if (!this.validatedColors.has(value)) {
        const page = await this.browser.newPage();
        try {
          const valid = await page.evaluate(
            (color) =>
              CSS.supports('color', color) &&
              !/var\(|currentcolor|inherit|initial|unset|revert/i.test(color),
            value,
          );
          if (!valid) throw new Error(`${location}: unresolved or invalid color ${value}.`);
          this.validatedColors.add(value);
        } finally {
          await page.close();
        }
      }
    } else {
      if (typeof value === 'string') {
        if (!/^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(value))
          throw new Error(
            `${location}: expected ${kind === 'length' ? 'pixels' : 'a number'}, received ${value}. Map a CSS token to resolve CSS units.`,
          );
        value = Number(value.replace(/px$/, ''));
      }
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`${location}: expected a finite number.`);
    }
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new Error(`${location}: unresolved token.`);
    this.values[location] = value;
    return value;
  }
  async number(
    token: Token | undefined,
    location: string,
    minimum: number,
    kind: 'length' | 'number' = 'length',
  ): Promise<number> {
    const value = await this.resolveToken(token, location, kind);
    if (typeof value !== 'number' || value < minimum)
      throw new Error(`${location}: expected a number >= ${minimum}.`);
    return value;
  }
  async typography(
    style: Typography | undefined,
    text: string,
    location: string,
  ): Promise<ResolvedTypography> {
    const missingFields = (['font', 'size', 'weight', 'lineHeight'] as const).filter(
      (key) => style?.[key] === undefined,
    );
    if (missingFields.length)
      throw new Error(
        missingFields
          .map((key) => `${location}.${key}: required typography value is missing.`)
          .join('\n'),
      );
    if (!style?.font) throw new Error(`${location}.font: required font name is missing.`);
    const weight = await this.number(style.weight, `${location}.weight`, 1, 'number');
    const file = this.config.fonts[style.font]?.find((font) => font.weight === weight);
    if (!file)
      throw new Error(
        `${location}: configure fonts.${style.font} with an actual font file for weight ${weight}.`,
      );
    const path = resolve(this.root, file.path);
    this.files.add(path);
    let data = this.fontData.get(path);
    if (!data) {
      data = await readFile(path);
      this.fontData.set(path, data);
    }
    const font = createFont(data);
    if (!('hasGlyphForCodePoint' in font))
      throw new Error(
        `${path}: font collections are unsupported. Supply an individual font file.`,
      );
    const weightTable: unknown = Reflect.get(font, 'OS/2');
    const declaredWeight: unknown =
      weightTable && typeof weightTable === 'object'
        ? Reflect.get(weightTable, 'usWeightClass')
        : undefined;
    const weightAxis = font.variationAxes.wght;
    if (
      weightAxis
        ? weight < weightAxis.min || weight > weightAxis.max
        : typeof declaredWeight === 'number' && declaredWeight !== weight
    ) {
      throw new Error(
        `${location}: ${file.path} does not contain configured weight ${weight}. Use the actual font face or a variable font covering that weight.`,
      );
    }
    const missing = [
      ...new Set(
        Array.from(text).filter(
          (character) =>
            !/\s/.test(character) && !font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0),
        ),
      ),
    ];
    if (missing.length)
      throw new Error(
        `${location}: ${file.path} cannot draw ${missing.map((character) => `${character} (U+${character.codePointAt(0)?.toString(16).toUpperCase()})`).join(', ')}.`,
      );
    this.fonts.set(`${style.font}:${weight}`, { name: style.font, weight, path, data });
    return {
      font: style.font,
      weight,
      size: await this.number(style.size, `${location}.size`, 1),
      lineHeight: await this.number(style.lineHeight, `${location}.lineHeight`, 1),
      letterSpacing:
        style.letterSpacing === undefined
          ? 0
          : await this.number(style.letterSpacing, `${location}.letterSpacing`, -100),
    };
  }
  async background(background: Background | undefined, location: string): Promise<string> {
    if (background && typeof background === 'object' && 'type' in background) {
      const stops = [];
      for (const [index, stop] of background.stops.entries()) {
        const color = await this.resolveToken(
          stop.color,
          `${location}.stops.${index}.color`,
          'color',
        );
        if (typeof color !== 'string')
          throw new Error(`${location}: unresolved gradient color.`);
        await this.assertOpaqueColor(color, `${location}.stops.${index}.color`);
        stops.push(`${color} ${stop.position}%`);
      }
      const value = `linear-gradient(${background.angle}deg, ${stops.join(', ')})`;
      this.values[location] = value;
      return value;
    }
    const value = await this.resolveToken(background, location, 'color');
    if (typeof value !== 'string') throw new Error(`${location}: expected a background color.`);
    await this.assertOpaqueColor(value, location);
    return value;
  }
  private async assertOpaqueColor(color: string, location: string): Promise<void> {
    if (this.opaqueColors.has(color)) return;
    const page = await this.browser.newPage();
    try {
      const opaque = await page.evaluate((value) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return false;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3] === 255;
      }, color);
      if (!opaque) throw new Error(`${location}: backgrounds must be opaque.`);
      this.opaqueColors.add(color);
    } finally {
      await page.close();
    }
  }
  async textRuns(
    content: TextContent,
    base: ResolvedTypography,
    baseColor: string,
    location: string,
  ): Promise<ResolvedTextRun[]> {
    const spans: TextSpan[] = typeof content === 'string' ? [{ text: content }] : content;
    const runs: ResolvedTextRun[] = [];
    for (const [index, span] of spans.entries()) {
      const runLocation = `${location}.runs.${index}`;
      const typography = await this.typography(
        {
          font: span.font ?? base.font,
          size: span.size ?? base.size,
          weight: span.weight ?? base.weight,
          lineHeight: span.lineHeight ?? base.lineHeight,
          letterSpacing: span.letterSpacing ?? base.letterSpacing,
        },
        span.text,
        runLocation,
      );
      const color =
        span.color !== undefined
          ? await this.resolveToken(span.color, `${runLocation}.color`, 'color')
          : baseColor;
      if (typeof color !== 'string') throw new Error(`${runLocation}.color: expected a color.`);
      runs.push({ ...typography, text: span.text, color });
    }
    return runs;
  }
  async resolve(slide: Slide, output: Output, location: string): Promise<ResolvedDesign> {
    const design = mergeDesign(this.config.design, output.design, slide.design);
    const errors: string[] = [];
    const collect = async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await operation();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        return undefined;
      }
    };
    const background = await collect(() =>
      this.background(design.background, `${location}.background`),
    );
    const text = await collect(() =>
      this.resolveToken(design.text, `${location}.text`, 'color'),
    );
    const padding = await collect(() => this.number(design.padding, `${location}.padding`, 0));
    const gap =
      slide.body || slide.screen
        ? await collect(() => this.number(design.gap, `${location}.gap`, 0))
        : 0;
    const headline = await collect(() =>
      this.typography(design.headline, '', `${location}.headline`),
    );
    const body = slide.body
      ? await collect(() => this.typography(design.body, '', `${location}.body`))
      : undefined;
    const secondaryText = slide.body
      ? await collect(() =>
          this.resolveToken(design.secondaryText, `${location}.secondaryText`, 'color'),
        )
      : undefined;
    if (errors.length) throw new Error(errors.join('\n'));
    if (
      typeof background !== 'string' ||
      typeof text !== 'string' ||
      padding === undefined ||
      gap === undefined ||
      !headline
    )
      throw new Error(`${location}: incomplete design.`);
    const headlineRuns = await this.textRuns(
      slide.headline,
      headline,
      text,
      `${location}.headline`,
    );
    const bodyRuns =
      slide.body && body && typeof secondaryText === 'string'
        ? await this.textRuns(slide.body, body, secondaryText, `${location}.body`)
        : undefined;
    return {
      background,
      text,
      padding,
      gap,
      headline,
      headlineRuns,
      ...(body ? { body } : {}),
      ...(bodyRuns ? { bodyRuns } : {}),
      ...(typeof secondaryText === 'string' ? { secondaryText } : {}),
    };
  }
}
