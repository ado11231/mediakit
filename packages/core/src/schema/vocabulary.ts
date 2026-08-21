import { z } from 'zod';
import type { Registries } from '../registry/registries.js';
import { describeConstraint } from './describe.js';

/**
 * The spec vocabulary a project actually has, derived from its registries.
 *
 * Invariant 5: the LLM's block vocabulary is read from the registry at runtime, never
 * hardcoded. The reference implementation kept a `REGISTRY_CATALOG` string that had to be
 * edited by hand, which meant registering a custom block taught the generator nothing. Here,
 * a block registered in `mediakit.config.ts` appears in this output on the next run with no
 * further work, which is the only way the extension API can be said to work.
 *
 * The enums below are not a contradiction of invariant 3. That invariant governs the Zod spec
 * schema, which must stay open so a consumer can add a surface without editing core. This is
 * generated output describing what is registered at this moment: naming the alternatives is
 * the entire point, and it is regenerated rather than maintained.
 */

export interface VocabularyOptions {
  registries: Registries;
  /**
   * Registered colour token names. `background` and any colour-valued prop resolve against
   * these at render time, so an author that invents one gets a throw. Enumerating them is
   * what stops that happening.
   */
  colors?: readonly string[] | undefined;
}

type Json = Record<string, unknown>;

/**
 * A Zod schema that cannot be represented as JSON Schema (a transform, a custom check) makes
 * `toJSONSchema` throw. A block like that is still renderable, so it must still appear in the
 * vocabulary; it just appears without its prop detail rather than taking the whole command
 * down.
 */
const propsSchema = (schema: z.ZodType): Json => {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  } catch {
    return {
      type: 'object',
      description: 'This block’s schema could not be expressed as JSON Schema.',
    };
  }
};

const blockDef = (type: string, schema: z.ZodType, slots: readonly string[]): Json => ({
  type: 'object',
  required: ['type', 'props'],
  additionalProperties: false,
  properties: {
    type: { const: type },
    props: propsSchema(schema),
    ...(slots.length === 0
      ? {}
      : { slot: { enum: [...slots], description: 'Required by this frame’s layout.' } }),
  },
});

/**
 * One frame variant per layout rather than a single frame shape with every slot name unioned.
 * A slot is only legal on a layout that declares it, and `assertSlot` throws in both
 * directions, so a schema that accepted `left` on a `centered` frame would be describing a
 * spec that does not render.
 */
const frameDef = (
  layoutName: string,
  slots: readonly string[],
  blockTypes: readonly string[],
  colors: readonly string[] | undefined,
): Json => ({
  type: 'object',
  required: ['layout', 'blocks'],
  additionalProperties: false,
  properties: {
    layout: { const: layoutName },
    background:
      colors === undefined
        ? { type: 'string' }
        : { enum: [...colors], description: 'A registered colour token name.' },
    blocks: {
      type: 'array',
      minItems: 1,
      items: {
        anyOf: blockTypes.map((type) => ({
          $ref: `#/$defs/${slots.length === 0 ? 'block' : `block_${layoutName}`}_${type}`,
        })),
      },
    },
  },
});

export const specJsonSchema = (options: VocabularyOptions): Json => {
  const { registries, colors } = options;
  const blockTypes = registries.blocks.names();
  const layoutNames = registries.layouts.names();
  const presetNames = registries.presets.names();

  const defs: Json = {};
  for (const layout of layoutNames) {
    const { slots } = registries.layouts.get(layout);
    const prefix = slots.length === 0 ? 'block' : `block_${layout}`;
    for (const type of blockTypes) {
      defs[`${prefix}_${type}`] = blockDef(type, registries.blocks.get(type).schema, slots);
    }
    defs[`frame_${layout}`] = frameDef(layout, slots, blockTypes, colors);
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'mediakit asset spec',
    description:
      'Generated from this project’s registries. Regenerate with `mediakit schema` ' +
      'after registering a block, layout, or preset.',
    type: 'object',
    required: ['id', 'preset', 'frames'],
    additionalProperties: false,
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        description: 'Lowercase slug. Names the output directory.',
      },
      preset: {
        oneOf: [
          { enum: [...presetNames] },
          { type: 'array', minItems: 1, items: { enum: [...presetNames] } },
        ],
        description: 'One registered preset, or several to fan out across.',
      },
      frames: {
        type: 'array',
        minItems: 1,
        items: { anyOf: layoutNames.map((l) => ({ $ref: `#/$defs/frame_${l}` })) },
      },
      meta: {
        type: 'object',
        additionalProperties: false,
        properties: { caption: { type: 'string' }, locale: { type: 'string' } },
      },
    },
    $defs: defs,
  };
};

const propLines = (schema: Json): string[] => {
  const properties = schema['properties'];
  if (typeof properties !== 'object' || properties === null) return ['  (no documented props)'];
  const required = new Set(Array.isArray(schema['required']) ? schema['required'] : []);

  return Object.entries(properties as Json).map(([name, raw]) => {
    const prop = raw as Json;
    const enumValues = prop['enum'];
    const kind = Array.isArray(enumValues)
      ? enumValues.map((v) => JSON.stringify(v)).join(' | ')
      : typeof prop['type'] === 'string'
        ? prop['type']
        : 'any';
    const flag = required.has(name) ? 'required' : 'optional';
    return `  ${name}: ${kind} (${flag})`;
  });
};

/**
 * The same vocabulary as prose. JSON Schema is what a structured-output API consumes; this is
 * what goes in a prompt or gets read by a person, and both come from one registry walk so
 * they cannot describe different products.
 */
export const vocabularyMarkdown = (options: VocabularyOptions): string => {
  const { registries, colors } = options;
  const out: string[] = ['# mediakit spec vocabulary', ''];

  out.push(
    'Generated from this project’s registries. A spec is JSON: an `id`, one or more',
    '`preset` names, and `frames`, each naming a `layout` and a list of `blocks`.',
    '',
    '## Presets',
    '',
  );
  for (const name of registries.presets.names()) {
    const preset = registries.presets.get(name);
    const rules = (preset.constraints ?? []).map(describeConstraint).join(', ');
    out.push(
      `- \`${name}\` ${preset.width}x${preset.height}${rules === '' ? '' : ` (${rules})`}`,
    );
  }

  out.push('', '## Layouts', '');
  for (const name of registries.layouts.names()) {
    const { slots } = registries.layouts.get(name);
    out.push(
      slots.length === 0
        ? `- \`${name}\` arranges blocks in order. Do not set \`slot\`.`
        : `- \`${name}\` requires \`slot\` on every block, one of: ${slots.map((s) => `\`${s}\``).join(', ')}`,
    );
  }

  if (colors !== undefined) {
    out.push(
      '',
      '## Colour tokens',
      '',
      'Valid for a frame’s `background` and any colour-valued prop:',
      '',
      colors.map((c) => `\`${c}\``).join(', '),
    );
  }

  out.push('', '## Blocks', '');
  for (const type of registries.blocks.names()) {
    out.push(`### ${type}`, '');
    out.push(...propLines(propsSchema(registries.blocks.get(type).schema)));
    out.push('');
  }

  return `${out.join('\n').trimEnd()}\n`;
};
