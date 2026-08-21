import type { Constraint } from '../registry/preset.js';

/**
 * One-line rendering of a channel constraint. Lives in core rather than in the CLI because
 * the generated vocabulary carries it too, and a consumer reading `mediakit presets` and an
 * LLM reading the schema must not be told different things about the same rule.
 */
export const describeConstraint = (constraint: Constraint): string => {
  switch (constraint.kind) {
    case 'noAlpha':
      return 'no alpha channel';
    case 'frameCount':
      return `${constraint.min}-${constraint.max} frames`;
    case 'aspectRatio':
      return `at most ${constraint.maxRatio}:1`;
    case 'altSizes':
      return `also accepts ${constraint.sizes.map(([w, h]) => `${w}x${h}`).join(', ')}`;
    case 'sizeRange':
      return `${constraint.min}-${constraint.max}px per side`;
  }
};
