import { z } from 'zod';

const nameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const tokenSchema = z.union([
  z.string().min(1),
  z.number(),
  z.strictObject({ source: z.string().min(1), token: z.string().min(1) }),
]);
const typographySchema = z.strictObject({
  font: z.string().min(1).optional(),
  size: tokenSchema.optional(),
  weight: tokenSchema.optional(),
  lineHeight: tokenSchema.optional(),
  letterSpacing: tokenSchema.optional(),
});
const designSchema = z.strictObject({
  background: tokenSchema.optional(),
  text: tokenSchema.optional(),
  secondaryText: tokenSchema.optional(),
  padding: tokenSchema.optional(),
  gap: tokenSchema.optional(),
  headline: typographySchema.optional(),
  body: typographySchema.optional(),
});
const positionSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().optional(),
});
const slideStyleSchema = z.strictObject({
  design: designSchema.optional(),
  positions: z
    .strictObject({
      headline: positionSchema.optional(),
      body: positionSchema.optional(),
      screen: positionSchema.optional(),
    })
    .optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});
const slideSchema = slideStyleSchema
  .extend({
    layout: z.enum(['headline-above-device', 'text-beside-device', 'text-only']),
    headline: z.string().min(1),
    body: z.string().min(1).optional(),
    screen: z.string().min(1).optional(),
    fixture: nameSchema.optional(),
    device: z.enum(['iphone', 'none']).default('none'),
    bezel: z.enum(['black', 'silver']).default('black'),
    outputs: z.record(z.string(), slideStyleSchema).optional(),
  })
  .superRefine((slide, context) => {
    if (slide.layout !== 'text-only' && !slide.screen)
      context.addIssue({
        code: 'custom',
        path: ['screen'],
        message: 'This layout requires a screen.',
      });
    if (slide.layout === 'text-only' && slide.screen)
      context.addIssue({
        code: 'custom',
        path: ['screen'],
        message: 'Use a device layout to include a screen.',
      });
  });
export const campaignSchema = z.strictObject({
  id: nameSchema,
  outputs: z
    .array(nameSchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Outputs must be unique.'),
  slides: z.array(slideSchema).min(1),
});
export const outputSchema = z.strictObject({
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192),
  format: z.enum(['png', 'pdf']).default('png'),
  minSlides: z.number().int().positive().default(1),
  maxSlides: z.number().int().positive().default(100),
  design: designSchema.optional(),
});
const screenshotSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('image'), path: z.string().min(1) }),
  z.strictObject({
    type: z.literal('web'),
    target: z.string(),
    scene: nameSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    scale: z.number().min(1).max(4).default(2),
  }),
  z.strictObject({ type: z.literal('ios'), target: z.string(), scene: nameSchema }),
]);
export const configSchema = z.strictObject({
  campaign: z.string().default('marketing/campaign.ts'),
  outDir: z.string().default('dist/marketing'),
  sources: z
    .record(
      z.string(),
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('css'),
          path: z.string(),
          selector: z.string().default(':root'),
          mode: z.enum(['light', 'dark']).default('light'),
        }),
        z.strictObject({
          type: z.literal('module'),
          path: z.string(),
          export: z.string().default('default'),
        }),
      ]),
    )
    .default({}),
  fonts: z
    .record(
      z.string(),
      z
        .array(z.strictObject({ path: z.string(), weight: z.number().int().min(1).max(1000) }))
        .min(1),
    )
    .default({}),
  design: designSchema.default({}),
  outputs: z.record(z.string(), outputSchema).default({}),
  screens: z.record(z.string(), screenshotSchema).default({}),
  capture: z
    .record(
      z.string(),
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('web'),
          url: z.url(),
          command: z.array(z.string()).min(1).optional(),
          env: z.record(z.string(), z.string()).default({}),
        }),
        z.strictObject({
          type: z.literal('ios'),
          appId: z.string().min(1),
          scheme: z.string().regex(/^[a-zA-Z][a-zA-Z0-9+.-]*$/),
          simulator: z.string().min(1),
          appPath: z.string().optional(),
        }),
      ]),
    )
    .default({}),
  environment: z
    .strictObject({
      locale: z.string().default('en-US'),
      timezone: z.string().default('UTC'),
      time: z.iso.datetime().default('2026-01-01T09:41:00.000Z'),
      seed: z.number().int().default(1),
      theme: z.enum(['light', 'dark']).default('light'),
      timeout: z.number().int().min(100).max(120000).default(30000),
    })
    .default({
      locale: 'en-US',
      timezone: 'UTC',
      time: '2026-01-01T09:41:00.000Z',
      seed: 1,
      theme: 'light',
      timeout: 30000,
    }),
});

export type Config = z.output<typeof configSchema>;
export type Campaign = z.output<typeof campaignSchema>;
export type Slide = Campaign['slides'][number];
export type Design = z.output<typeof designSchema>;
export type Typography = z.output<typeof typographySchema>;
export type Token = z.output<typeof tokenSchema>;
export type Output = z.output<typeof outputSchema>;
export type Position = z.output<typeof positionSchema>;
export const defineConfig = (
  config: z.input<typeof configSchema>,
): z.input<typeof configSchema> => config;
export const defineCampaign = (
  campaign: z.input<typeof campaignSchema>,
): z.input<typeof campaignSchema> => campaign;

export function parseInput<T>(schema: z.ZodType<T>, input: unknown, file: string): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `${file}:\n${result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    );
  return result.data;
}
