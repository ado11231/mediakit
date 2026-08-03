import { z } from 'zod';
import { MediakitError } from '../errors.js';

/**
 * Not one field here is a `z.enum`. `preset`, `layout`, `type`, `background`, and `slot`
 * are open strings resolved against a registry at render time, because a closed set
 * anywhere in this schema makes "add a marketing surface" mean "edit core and cut a
 * release". Validation is not weaker for it: the registry knows what is registered, so its
 * error can list the alternatives, which an enum cannot do for anything a consumer added.
 *
 * Brand rules (`noExclamations`, `maxHeadline`, `forbiddenWords`) are deliberately absent.
 * They are config, and baking one into this schema would make it un-overridable.
 */

export const blockSchema = z.object({
  type: z.string().min(1, 'block type must not be empty'),
  props: z.unknown(),
  slot: z.string().min(1, 'slot must not be empty').optional(),
});

export const frameSchema = z.object({
  layout: z.string().min(1, 'layout must not be empty'),
  background: z.string().min(1, 'background must not be empty').optional(),
  blocks: z.array(blockSchema),
});

export const assetSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be a lowercase slug, matching /^[a-z0-9-]+$/'),
  preset: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  frames: z.array(frameSchema).min(1, 'a spec must declare at least one frame'),
  meta: z
    .object({
      caption: z.string().optional(),
      locale: z.string().optional(),
    })
    .optional(),
});

export type BlockSpec = z.infer<typeof blockSchema>;
export type FrameSpec = z.infer<typeof frameSchema>;
export type AssetSpec = z.infer<typeof assetSpecSchema>;

const formatIssue = (issue: z.core.$ZodIssue): string => {
  const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
  return `  ${path}: ${issue.message}`;
};

/**
 * Reports every failing field at once. Stopping at the first means a consumer fixes one
 * field, re-runs, and finds another, which for a five-frame spec is five round trips.
 */
export const parseSpec = (data: unknown, file: string): AssetSpec => {
  const result = assetSpecSchema.safeParse(data);
  if (result.success) return result.data;

  throw new MediakitError(
    `Invalid spec in ${file}:\n${result.error.issues.map(formatIssue).join('\n')}`,
  );
};

/** `preset` accepts an array so fan-out intent lives in the reviewed spec, not a shell flag. */
export const presetNames = (spec: AssetSpec): readonly string[] =>
  typeof spec.preset === 'string' ? [spec.preset] : spec.preset;
