import type { FrameDefinition } from '../registry/frame.js';
import type { Registry } from '../registry/registry.js';
import type { Preset } from '../registry/preset.js';
import type { ResolvedTokens } from '../tokens/contract.js';

/**
 * `frameIndex` and `frameCount` ride along even though nothing at M1 reads them. Widening
 * this signature later would break every block a consumer has written, and they unlock a
 * category of effect that is otherwise impossible: a background that pans continuously
 * across a carousel, or a "3 of 5" progress indicator, cannot be built while frames render
 * with no knowledge of their neighbours.
 *
 * `frames` is here for the same reason: `DeviceFrame` resolves its `chrome` prop against the
 * frame registry at render time, and the registry is per-config (built from `defineConfig`),
 * so it cannot be captured in the block's closure. Adding a field to this object does not
 * break existing blocks, which destructure only what they read, so this is the cheap place to
 * widen rather than a separate context passed alongside.
 */
export interface RenderContext {
  tokens: ResolvedTokens;
  preset: Preset;
  frameIndex: number;
  frameCount: number;
  frames: Registry<FrameDefinition>;
}
