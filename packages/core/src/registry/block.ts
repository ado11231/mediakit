import type { z } from 'zod';
import type { Element } from '../element.js';
import { MediakitError, formatLocation, type SpecLocation } from '../errors.js';
import type { RenderContext } from '../render/context.js';
import { Registry } from './registry.js';

export type BlockRenderer<P> = (props: P, context: RenderContext) => Element;

export interface BlockDefinition<S extends z.ZodType> {
  schema: S;
  still?: BlockRenderer<z.infer<S>>;
  video?: BlockRenderer<z.infer<S>>;
}

/** A block after its schema and renderer have been tied together by `defineBlock`. */
export interface BlockEntry {
  schema: z.ZodType;
  still?: ErasedRenderer;
  video?: ErasedRenderer;
}

type ErasedRenderer = (
  props: unknown,
  context: RenderContext,
  location?: SpecLocation,
) => Element;

const parseProps = <S extends z.ZodType>(
  schema: S,
  props: unknown,
  location?: SpecLocation,
): z.infer<S> => {
  const result = schema.safeParse(props);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map(
      (issue) =>
        `  ${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`,
    )
    .join('\n');

  throw new MediakitError(`Invalid block props${formatLocation(location)}:\n${issues}`);
};

const bind = <S extends z.ZodType>(
  schema: S,
  render: BlockRenderer<z.infer<S>>,
): ErasedRenderer => {
  return (props, context, location) => render(parseProps(schema, props, location), context);
};

/**
 * Ties a block's schema to its renderer so the renderer's props are inferred from the
 * schema and validated before it runs. This is what removes the per-block `props.text as
 * string` casts the reference registry needed roughly eleven times: the one place a value
 * crosses from `unknown` into a typed prop is `parseProps`, and it crosses through a Zod
 * parse rather than an assertion.
 *
 * A block is unrenderable without a schema, so `schema` is required rather than optional.
 */
export const defineBlock = <S extends z.ZodType>(
  definition: BlockDefinition<S>,
): BlockEntry => {
  const { schema, still, video } = definition;

  return {
    schema,
    ...(still === undefined ? {} : { still: bind(schema, still) }),
    ...(video === undefined ? {} : { video: bind(schema, video) }),
  };
};

export const createBlockRegistry = (): Registry<BlockEntry> =>
  new Registry<BlockEntry>('block');
