import type { SpecLocation } from '../errors.js';
import type { AssetSpec } from '../spec/schema.js';

/**
 * Glyph coverage, read from a font's `cmap` table.
 *
 * satori substitutes silently when a glyph is missing, exactly as it does for a missing font
 * weight, and the result is a blank or a tofu box in a screenshot that `check` passes and a
 * store accepts. `fonts.ts` already catches the weight case at render time; this catches the
 * same failure one level down, at the codepoint.
 *
 * Parsed here with `node:buffer` alone rather than an opentype dependency: the install-size
 * budget is the thing this project competes on, and the subset of the format needed to answer
 * "is this codepoint mapped" is small.
 */

/** `undefined` means the format was not recognised, which is never reported as a violation. */
export type Coverage = ReadonlySet<number> | undefined;

const TRUETYPE = 0x00010000;
const TRUE_TAG = 0x74727565; // 'true', old Apple TrueType
const OTTO = 0x4f54544f; // 'OTTO', CFF outlines

/**
 * A pathological font could declare a group spanning the whole of Unicode. The cap is far
 * above any real font (the largest CJK faces map on the order of 10^5 codepoints) and exists
 * only so a corrupt table cannot exhaust memory during a check.
 */
const MAX_CODEPOINTS = 1_000_000;

const readTable = (font: Buffer, tag: string): Buffer | undefined => {
  if (font.length < 12) return undefined;
  const version = font.readUInt32BE(0);
  if (version !== TRUETYPE && version !== TRUE_TAG && version !== OTTO) return undefined;

  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    if (record + 16 > font.length) return undefined;
    if (font.toString('ascii', record, record + 4) === tag) {
      const offset = font.readUInt32BE(record + 8);
      const length = font.readUInt32BE(record + 12);
      if (offset + length > font.length) return undefined;
      return font.subarray(offset, offset + length);
    }
  }
  return undefined;
};

const parseFormat0 = (sub: Buffer, out: Set<number>): void => {
  for (let c = 0; c < 256; c += 1) {
    if (6 + c < sub.length && sub.readUInt8(6 + c) !== 0) out.add(c);
  }
};

const parseFormat4 = (sub: Buffer, out: Set<number>): void => {
  const segCountX2 = sub.readUInt16BE(6);
  const segCount = segCountX2 / 2;
  const endAt = 14;
  const startAt = endAt + segCountX2 + 2;
  const deltaAt = startAt + segCountX2;
  const rangeAt = deltaAt + segCountX2;
  if (rangeAt + segCountX2 > sub.length) return;

  for (let i = 0; i < segCount; i += 1) {
    const end = sub.readUInt16BE(endAt + i * 2);
    const start = sub.readUInt16BE(startAt + i * 2);
    // The last segment is the required 0xFFFF terminator, not real coverage.
    if (start > end || start === 0xffff) continue;

    const delta = sub.readInt16BE(deltaAt + i * 2);
    const rangeOffset = sub.readUInt16BE(rangeAt + i * 2);

    for (let c = start; c <= end; c += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const at = rangeAt + i * 2 + rangeOffset + (c - start) * 2;
        if (at + 2 > sub.length) continue;
        glyph = sub.readUInt16BE(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      // Glyph 0 is .notdef, which is precisely the tofu box this check exists to prevent, so
      // a codepoint mapped to it is not covered.
      if (glyph !== 0) out.add(c);
    }
  }
};

const parseFormat6 = (sub: Buffer, out: Set<number>): void => {
  const first = sub.readUInt16BE(6);
  const count = sub.readUInt16BE(8);
  for (let i = 0; i < count; i += 1) {
    const at = 10 + i * 2;
    if (at + 2 > sub.length) return;
    if (sub.readUInt16BE(at) !== 0) out.add(first + i);
  }
};

const parseFormat12 = (sub: Buffer, out: Set<number>): void => {
  const nGroups = sub.readUInt32BE(12);
  for (let i = 0; i < nGroups; i += 1) {
    const at = 16 + i * 12;
    if (at + 12 > sub.length) return;
    const start = sub.readUInt32BE(at);
    const end = sub.readUInt32BE(at + 4);
    const startGlyph = sub.readUInt32BE(at + 8);
    if (start > end || end - start > MAX_CODEPOINTS) continue;
    for (let c = start; c <= end; c += 1) {
      if (startGlyph + (c - start) !== 0) out.add(c);
      if (out.size > MAX_CODEPOINTS) return;
    }
  }
};

/**
 * Unicode subtables only. Platform 1 (Mac Roman) indexes its own character set rather than
 * Unicode, so including it would mark the wrong codepoints as covered. Every Unicode subtable
 * is unioned rather than one being picked, since a font may map the BMP in format 4 and the
 * astral planes in format 12.
 */
const isUnicode = (platformId: number, encodingId: number): boolean =>
  platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));

export const glyphCoverage = (font: Buffer): Coverage => {
  const cmap = readTable(font, 'cmap');
  if (cmap === undefined || cmap.length < 4) return undefined;

  const out = new Set<number>();
  const numTables = cmap.readUInt16BE(2);

  for (let i = 0; i < numTables; i += 1) {
    const record = 4 + i * 8;
    if (record + 8 > cmap.length) break;
    const platformId = cmap.readUInt16BE(record);
    const encodingId = cmap.readUInt16BE(record + 2);
    if (!isUnicode(platformId, encodingId)) continue;

    const offset = cmap.readUInt32BE(record + 4);
    if (offset + 4 > cmap.length) continue;
    const sub = cmap.subarray(offset);

    switch (sub.readUInt16BE(0)) {
      case 0:
        parseFormat0(sub, out);
        break;
      case 4:
        parseFormat4(sub, out);
        break;
      case 6:
        parseFormat6(sub, out);
        break;
      case 12:
        parseFormat12(sub, out);
        break;
      default:
        break;
    }
  }

  return out.size === 0 ? undefined : out;
};

/**
 * Codepoints a font is not expected to map and satori does not draw: C0 and C1 controls
 * (a newline is a line break, not a glyph), zero-width and bidi formatting marks, the
 * variation selectors that only choose a presentation, and the byte-order mark. Flagging
 * these would be noise, and the base character of an emoji sequence is still reported.
 */
const isNonPrinting = (code: number): boolean =>
  code < 0x20 ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x2028 && code <= 0x202e) ||
  (code >= 0xfe00 && code <= 0xfe0f) ||
  code === 0x2060 ||
  code === 0xfeff;

const codepoint = (char: string): string =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

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

export interface GlyphViolation extends SpecLocation {
  message: string;
}

/**
 * Every string in every block, checked codepoint by codepoint against the union of the loaded
 * fonts. Walking all props rather than a list of text-bearing block types is the same choice
 * `checkBrandRules` makes, and for the same reason: a custom block's text is checked without
 * core knowing the block by name.
 *
 * The cost of that choice is that a non-Latin character in a prop which is never drawn, a
 * `DeviceFrame` src path for instance, is reported too. That direction is the safe one: the
 * alternative is a text prop this checker does not recognise going unchecked and shipping as
 * tofu.
 *
 * `coverage` of `undefined` means no font could be parsed, and reports nothing at all. A
 * parser limitation must never produce a violation against a font that is in fact complete.
 */
export const checkGlyphs = (
  spec: AssetSpec,
  coverage: Coverage,
  file: string,
): GlyphViolation[] => {
  if (coverage === undefined) return [];
  const violations: GlyphViolation[] = [];

  for (const [frameIndex, frame] of spec.frames.entries()) {
    for (const block of frame.blocks) {
      for (const text of collectStrings(block.props)) {
        const missing = [...new Set(text)].filter((char) => {
          const code = char.codePointAt(0);
          return code !== undefined && !isNonPrinting(code) && !coverage.has(code);
        });
        if (missing.length === 0) continue;

        const named = missing.map((c) => `${JSON.stringify(c)} (${codepoint(c)})`).join(', ');
        violations.push({
          file,
          frameIndex,
          message:
            `glyphCoverage: ${block.type} ${JSON.stringify(text)} uses ${named}, which the ` +
            `loaded fonts do not draw. satori substitutes silently, so this renders blank or ` +
            `as a tofu box and uploads without complaint. Load a font covering it, or edit ` +
            `the text.`,
        });
      }
    }
  }

  return violations;
};
