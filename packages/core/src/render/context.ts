import type { Preset } from '../registry/preset.js';
import type { ResolvedTokens } from '../tokens/contract.js';

/**
 * `frameIndex` and `frameCount` ride along even though nothing at M1 reads them. Widening
 * this signature later would break every block a consumer has written, and they unlock a
 * category of effect that is otherwise impossible: a background that pans continuously
 * across a carousel, or a "3 of 5" progress indicator, cannot be built while frames render
 * with no knowledge of their neighbours.
 */
export interface RenderContext {
  tokens: ResolvedTokens;
  preset: Preset;
  frameIndex: number;
  frameCount: number;
}
