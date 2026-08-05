import { MediakitError, type SpecLocation } from '../errors.js';
import type { Preset } from '../registry/preset.js';
import type { Registries } from '../registry/registries.js';
import type { AssetSpec } from '../spec/schema.js';
import { presetNames } from '../spec/schema.js';
import type { BrandRules } from '../config.js';

export interface Violation {
  readonly preset?: string;
  readonly file?: string;
  readonly frameIndex?: number;
  readonly message: string;
}

const location = (file: string, frameIndex?: number): SpecLocation =>
  frameIndex === undefined ? { file } : { file, frameIndex };

/**
 * Brand rules apply to the text a spec carries, not to its structure. Walking every block's
 * props for string values keeps the rule honest against custom blocks the checker does not
 * know by name: a `PricingCard` whose `tier` reads "Game-changing!" fails noExclamations
 * without the checker having a list of text-bearing types.
 *
 * `maxHeadline` is the exception. It is a length cap on headlines specifically, so it scopes
 * to blocks named `Headline` and `Subhead`, the built-in headline types. A consumer who moves
 * the cap to a custom block names the type in the spec, and the rule stays out of core.
 */
const TEXT_BLOCK_TYPES = new Set(['Headline', 'Subhead']);

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
};

const checkBrandRules = (
  spec: AssetSpec,
  brandRules: BrandRules | undefined,
  file: string,
): Violation[] => {
  if (brandRules === undefined) return [];
  const violations: Violation[] = [];

  const { noExclamations, maxHeadline, forbiddenWords } = brandRules;

  for (const [frameIndex, frame] of spec.frames.entries()) {
    const loc = location(file, frameIndex);
    for (const block of frame.blocks) {
      const strings = collectStrings(block.props);

      if (noExclamations === true) {
        for (const text of strings) {
          if (text.includes('!')) {
            violations.push({
              ...loc,
              message: `noExclamations: ${JSON.stringify(text)} contains an exclamation mark`,
            });
          }
        }
      }

      if (forbiddenWords !== undefined) {
        for (const word of forbiddenWords) {
          for (const text of strings) {
            if (text.toLowerCase().includes(word.toLowerCase())) {
              violations.push({
                ...loc,
                message: `forbiddenWords: ${JSON.stringify(text)} contains "${word}"`,
              });
            }
          }
        }
      }

      if (maxHeadline !== undefined && TEXT_BLOCK_TYPES.has(block.type)) {
        for (const text of strings) {
          if (text.length > maxHeadline) {
            violations.push({
              ...loc,
              message: `maxHeadline: ${block.type} ${JSON.stringify(text)} is ${text.length} characters, max is ${maxHeadline}`,
            });
          }
        }
      }
    }
  }

  return violations;
};

const checkFrameCount = (
  spec: AssetSpec,
  registries: Registries,
  file: string,
): Violation[] => {
  const violations: Violation[] = [];
  const count = spec.frames.length;

  for (const preset of presetNames(spec)) {
    const entry = registries.presets.has(preset)
      ? registries.presets.get(preset, location(file))
      : undefined;
    const cap = entry?.constraints?.find(
      (c): c is { kind: 'frameCount'; min: number; max: number } => c.kind === 'frameCount',
    );
    if (cap !== undefined && (count < cap.min || count > cap.max)) {
      violations.push({
        preset,
        message: `frameCount: preset "${preset}" allows ${cap.min}-${cap.max} frames, the spec declares ${count}`,
      });
    }
  }

  return violations;
};

/**
 * Spec-level checks: brand rules across every block's text props, and frame-count caps per
 * preset the spec names. Reports every violation together rather than stopping at the first,
 * because `check` is the one command whose value is the full picture before an upload.
 */
export const checkSpec = (
  spec: AssetSpec,
  registries: Registries,
  brandRules: BrandRules | undefined,
  file: string,
): Violation[] => [
  ...checkBrandRules(spec, brandRules, file),
  ...checkFrameCount(spec, registries, file),
];

interface PngInfo {
  width: number;
  height: number;
  /** PNG color type from IHDR. 6 and 4 carry an alpha channel; 0, 2, 3 do not. */
  colorType: number;
  hasTrns: boolean;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads the IHDR and walks the chunk list for a tRNS chunk, which is enough to decide whether
 * a PNG can carry transparency without decoding pixels. A consumer with hand-made screenshots
 * is the on-ramp `check` exists for, and parsing chunks with node:buffer costs nothing at
 * install, where a PNG decoder dependency would.
 */
export const parsePng = (png: Buffer, file: string): PngInfo => {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIG)) {
    throw new MediakitError(`check: ${file} is not a PNG (bad signature).`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png.readUInt8(25);

  let hasTrns = false;
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'tRNS') {
      hasTrns = true;
      break;
    }
    if (type === 'IDAT') break;
    offset += 12 + length;
  }

  return { width, height, colorType, hasTrns };
};

const checkConstraint = (
  preset: Preset,
  name: string,
  info: PngInfo,
  file: string,
): Violation[] => {
  const violations: Violation[] = [];

  if (info.width !== preset.width || info.height !== preset.height) {
    violations.push({
      preset: name,
      file,
      message: `dimensions: ${file} is ${info.width}x${info.height}, preset "${name}" requires ${preset.width}x${preset.height}`,
    });
  }

  for (const constraint of preset.constraints ?? []) {
    if (constraint.kind === 'noAlpha') {
      if (info.colorType === 6 || info.colorType === 4 || info.hasTrns) {
        violations.push({
          preset: name,
          file,
          message: `noAlpha: ${file} carries transparency (PNG color type ${info.colorType}${info.hasTrns ? ' plus a tRNS chunk' : ''}), which the channel rejects.`,
        });
      }
    } else if (constraint.kind === 'aspectRatio') {
      const max = Math.max(info.width, info.height);
      const min = Math.min(info.width, info.height);
      if (min === 0 || max / min > constraint.maxRatio) {
        violations.push({
          preset: name,
          file,
          message: `aspectRatio: ${file} is ${info.width}x${info.height}, ratio ${max / min} exceeds the ${constraint.maxRatio}x ceiling for "${name}".`,
        });
      }
    }
  }

  return violations;
};

/**
 * Pixel-level checks against a single rendered (or hand-made) PNG: exact dimensions, noAlpha,
 * and the aspect-ratio ceiling. Returns every violation, so a single bad screenshot reports
 * both a wrong size and a rejected alpha channel rather than just the first.
 */
export const checkAsset = (
  preset: Preset,
  name: string,
  png: Buffer,
  file: string,
): Violation[] => {
  const info = parsePng(png, file);
  return checkConstraint(preset, name, info, file);
};
