/**
 * Reading a rendered frame back out of satori's SVG.
 *
 * Two rules need the same three facts about a frame and neither can get them from the spec:
 * where the glyphs actually landed, what colour they are, and what is painted behind them.
 * satori's own output is the only place all three exist, so this module is the one place that
 * knows its shape, and both `checkOverflow` and `checkContrast` read from here.
 *
 * Everything is best effort by design. A shape this cannot resolve is dropped rather than
 * guessed at, which costs a rule its finding and never invents one: the same posture the
 * `cmap` parser takes toward a table it does not recognise.
 */

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface GlyphRun {
  /** Glyph outline bounds in layout coordinates, comparable with a laid-out box. */
  readonly ink: Bounds;
  /** The same bounds on the canvas, transform applied, or `undefined` if it cannot be. */
  readonly painted: Bounds | undefined;
  /** The computed fill satori resolved for the run, verbatim. */
  readonly fill: string;
}

/**
 * A painted rectangle: a background, a card, a pill, an image. Kept in paint order.
 *
 * `fill` is `undefined` for a rectangle whose colour cannot be stated as one value: a gradient,
 * a photo, a translucent layer, a shape moved by a transform this cannot resolve. Recording
 * those rather than dropping them is the whole point. A gradient painted over the page still
 * hides the page, and a rule that skipped it would go on to measure text against a colour that
 * is nowhere near it.
 */
export interface FilledShape {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly fill: string | undefined;
}

/** One text-bearing element as satori laid it out, in untransformed layout coordinates. */
export interface TextBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
}

export interface Frame {
  readonly runs: readonly GlyphRun[];
  readonly shapes: readonly FilledShape[];
}

const TAG = /<(\/?)([A-Za-z][\w-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

/**
 * Subtrees whose contents are never painted where they appear. A mask's white rectangle is the
 * shape of a hole, not a background, and picking one up as one would report a white page under
 * text on a black one.
 */
const OFF_CANVAS = new Set(['defs', 'mask', 'clippath', 'filter', 'pattern', 'lineargradient']);

const attributes = (raw: string): Record<string, string> => {
  const found: Record<string, string> = {};
  for (const [, name = '', value = ''] of raw.matchAll(ATTRIBUTE)) found[name] = value;
  return found;
};

/**
 * Glyph outlines are drawn with absolute moves, lines, and curves. Borders and rounded corners
 * use relative and arc commands, so a path carrying any of those is not a glyph run and its
 * numbers are not coordinate pairs.
 */
const GLYPH_PATH = /^[MLQCZ0-9\s.,+\-eE]*$/;
const NUMBER = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

const pathBounds = (d: string): Bounds | undefined => {
  if (!GLYPH_PATH.test(d)) return undefined;

  const numbers = d.match(NUMBER);
  if (numbers === null || numbers.length < 2 || numbers.length % 2 !== 0) return undefined;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < numbers.length; i += 2) {
    const x = Number(numbers[i]);
    const y = Number(numbers[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX, maxX, minY, maxY };
};

const MATRIX = /^matrix\(([^)]*)\)$/;

/**
 * `undefined` when the transform rotates or skews: a rotated run's true extent cannot be
 * recovered from an axis-aligned box, and the over-estimate would report an overflow that is
 * not there.
 */
const applyTransform = (bounds: Bounds, transform: string | undefined): Bounds | undefined => {
  if (transform === undefined) return bounds;

  const found = MATRIX.exec(transform);
  if (found === null) return undefined;

  const parts = (found[1] ?? '').split(',').map(Number);
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return undefined;

  const [a, b, c, d, e, f] = parts as [number, number, number, number, number, number];
  if (b !== 0 || c !== 0) return undefined;

  const xs = [a * bounds.minX + e, a * bounds.maxX + e];
  const ys = [d * bounds.minY + f, d * bounds.maxY + f];
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const rectangle = (attrs: Record<string, string>): FilledShape | undefined => {
  const width = Number(attrs['width']);
  const height = Number(attrs['height']);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  const left = Number(attrs['x'] ?? '0');
  const top = Number(attrs['y'] ?? '0');
  if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined;

  return { left, top, width, height, fill: attrs['fill'] };
};

/**
 * Whether this rectangle's colour can be stated as one value. `false` still means it is
 * painted, and painted is what matters for what a reader sees behind a line of text.
 */
const isFlat = (attrs: Record<string, string>): boolean => {
  const fill = attrs['fill'];
  if (fill === undefined || fill.startsWith('url(')) return false;
  if (attrs['transform'] !== undefined) return false;
  if (attrs['opacity'] !== undefined && Number(attrs['opacity']) !== 1) return false;
  return true;
};

/**
 * Walks the document in paint order, keeping only what a rule can reason about. The stack
 * exists for two questions a regex cannot answer: whether an element is inside a definition
 * rather than on the canvas, and whether a group is a drop shadow, whose source shape is
 * painted in the shadow's colour and would otherwise read as a background.
 */
export const readFrame = (svg: string): Frame => {
  const runs: GlyphRun[] = [];
  const shapes: FilledShape[] = [];
  const stack: { name: string; hidden: boolean }[] = [];

  for (const match of svg.matchAll(TAG)) {
    const [, closing = '', rawName = '', rawAttrs = '', selfClosing = ''] = match;
    const name = rawName.toLowerCase();

    if (closing === '/') {
      if (stack.length > 0 && stack[stack.length - 1]?.name === name) stack.pop();
      continue;
    }

    const attrs = attributes(rawAttrs);
    const hidden =
      OFF_CANVAS.has(name) ||
      (name === 'g' && (attrs['filter'] !== undefined || attrs['opacity'] === '0'));

    if (selfClosing !== '/') {
      stack.push({ name, hidden });
    }
    if (hidden || stack.some((entry) => entry.hidden)) continue;

    if (name === 'path' && attrs['d'] !== undefined && attrs['width'] === undefined) {
      // Every path satori draws for a background, a border, or a shadow states the box it
      // belongs to as `width`. Glyph runs never do, which is what separates ink from chrome.
      const ink = pathBounds(attrs['d']);
      if (ink !== undefined) {
        runs.push({
          ink,
          painted: applyTransform(ink, attrs['transform']),
          fill: attrs['fill'] ?? 'black',
        });
      }
      continue;
    }

    if (name === 'rect' || name === 'path' || name === 'image') {
      // A stroke with no fill is a border, which paints an outline rather than a surface.
      if (attrs['fill'] === 'none') continue;

      const shape = rectangle(attrs);
      if (shape !== undefined) {
        shapes.push(isFlat(attrs) ? shape : { ...shape, fill: undefined });
      }
    }
  }

  return { runs, shapes };
};

/**
 * The last shape painted under a box, which is the one a reader sees. Containment must be
 * total: a line of text straddling two surfaces has no single colour behind it, and averaging
 * them would invent a number that describes neither.
 *
 * The result may be a shape with no resolvable `fill`, and that is a finding rather than a
 * miss: it says something is painted there and this cannot say what.
 */
export const shapeBehind = (
  box: { left: number; top: number; width: number; height: number },
  shapes: readonly FilledShape[],
): FilledShape | undefined => {
  let found: FilledShape | undefined;

  for (const shape of shapes) {
    const contains =
      shape.left <= box.left &&
      shape.top <= box.top &&
      shape.left + shape.width >= box.left + box.width &&
      shape.top + shape.height >= box.top + box.height;
    if (contains) found = shape;
  }

  return found;
};

/**
 * Ink can sit a fraction of a pixel outside the advance width it was measured from, and satori
 * rounds coordinates to a tenth. The tolerance keeps that from reading as a difference; a real
 * one is tens of pixels, never one.
 */
export const TOLERANCE = 2;

/**
 * Which laid-out box a run of glyphs came from. The SVG says what was drawn and the layout pass
 * says what was intended, and only the pair shows a line that did not fit: matching them is
 * what lets a rule quote the offending text rather than a coordinate.
 *
 * Matched by horizontal overlap rather than by a shared left edge, because a padded box does
 * not share one: a `CTA` pill starts well to the left of its own first glyph. Overlap is
 * measured against the narrower of the two, so a line that overflows its box scores as highly
 * as one that sits inside it with room to spare.
 */
export const matchBox = (run: GlyphRun, boxes: readonly TextBox[]): TextBox | undefined => {
  const centerY = (run.ink.minY + run.ink.maxY) / 2;
  const inkWidth = run.ink.maxX - run.ink.minX;

  let best: TextBox | undefined;
  let bestScore = 0;

  for (const box of boxes) {
    if (centerY < box.top || centerY > box.top + box.height) continue;

    const overlap =
      Math.min(run.ink.maxX, box.left + box.width) - Math.max(run.ink.minX, box.left);
    if (overlap <= 0) continue;

    const score = overlap / Math.max(Math.min(inkWidth, box.width), 1);
    // A tie goes to the smaller box, which is the innermost element the run can belong to.
    const better =
      score > bestScore ||
      (score === bestScore && best !== undefined && box.width < best.width);
    if (better) {
      best = box;
      bestScore = score;
    }
  }

  return bestScore > 0.5 ? best : undefined;
};
