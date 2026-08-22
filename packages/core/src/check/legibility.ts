import type { Registries } from '../registry/registries.js';
import type { AssetSpec } from '../spec/schema.js';
import { presetNames } from '../spec/schema.js';
import { resolveTokens } from '../tokens/resolve.js';
import type { TokensInput } from '../tokens/contract.js';
import type { Violation } from './index.js';

/**
 * Text too small to read once a channel scales the asset down.
 *
 * A store gallery does not show a 1320x2868 screenshot at 1320px. It shows it at roughly a
 * fifth of that, in a scrollable row, and text sized for an app viewport disappears. The
 * render succeeds, the dimensions validate, `check` passes, and the asset uploads: the exact
 * shape of failure this project exists to prevent, with nothing to point at.
 *
 * The threshold is a fraction of canvas width rather than an absolute pixel size, because a
 * canvas is only ever viewed scaled to some display width and the ratio is what survives that.
 * 3.5% is deliberately generous: a 6.9 inch screenshot shown at about 200pt needs roughly 5.5%
 * to clear an 11pt legibility floor, so this flags only text that is far past arguable.
 *
 * Scoped to presets that declare channel constraints, which is to say the ones something gets
 * uploaded to. A social preset has no rejection risk and its own conventions.
 *
 * Reported as a warning rather than an error. The exact display width of a store gallery is
 * not published, so this is a well-founded heuristic and not a rule anyone can verify; failing
 * a build on it would be claiming more certainty than exists. `check --strict` promotes it.
 */
const MIN_TEXT_FRACTION = 0.035;

export const checkLegibility = (
  spec: AssetSpec,
  registries: Registries,
  tokens: TokensInput,
  file: string,
): Violation[] => {
  const violations: Violation[] = [];

  for (const name of presetNames(spec)) {
    if (!registries.presets.has(name)) continue;
    const preset = registries.presets.get(name, { file });
    if ((preset.constraints ?? []).length === 0) continue;

    const resolved = resolveTokens(tokens, preset.scale);
    const floor = preset.width * MIN_TEXT_FRACTION;

    const smallest = Object.entries(resolved.type).sort(
      (a, b) => a[1].fontSize - b[1].fontSize,
    )[0];
    if (smallest === undefined) continue;

    const [tokenName, style] = smallest;
    if (style.fontSize >= floor) continue;

    const percent = ((style.fontSize / preset.width) * 100).toFixed(1);
    const suggested = Math.ceil((floor / style.fontSize) * preset.scale * 10) / 10;

    violations.push({
      preset: name,
      file,
      severity: 'warning',
      message:
        `legibility: type.${tokenName} resolves to ${Math.round(style.fontSize)}px on a ` +
        `${preset.width}x${preset.height} canvas, which is ${percent}% of its width. A store ` +
        `gallery shows this asset at a fraction of full size, so text below ` +
        `${(MIN_TEXT_FRACTION * 100).toFixed(1)}% is unlikely to be readable there. Raise ` +
        `tokens.scale to about ${suggested} for this preset, or point those blocks at a ` +
        `larger type token.`,
    });
  }

  return violations;
};
