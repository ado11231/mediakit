import { outputSchema, type Config, type Output } from './schema.js';

export const presets: Readonly<Record<string, Output>> = Object.fromEntries(
  Object.entries({
    'instagram-portrait': { width: 1080, height: 1350, maxSlides: 20 },
    'instagram-square': { width: 1080, height: 1080, maxSlides: 20 },
    'instagram-story': { width: 1080, height: 1920 },
    'linkedin-document': { width: 1080, height: 1350, format: 'pdf' },
    'app-store-iphone': { width: 1320, height: 2868, maxSlides: 10 },
    'app-store-ipad': { width: 2064, height: 2752, maxSlides: 10 },
    'google-play-phone': { width: 1080, height: 1920, minSlides: 2, maxSlides: 8 },
  }).map(([name, preset]) => [name, outputSchema.parse(preset)]),
);
export function resolveOutput(name: string, config: Config): Output {
  const preset = presets[name];
  const override = config.outputs[name];
  if (!preset && !override)
    throw new Error(
      `Unknown output "${name}". Choose ${Object.keys(presets).join(', ')} or configure outputs.${name}.`,
    );
  if (preset && override) {
    for (const key of ['width', 'height', 'format', 'minSlides', 'maxSlides'] as const) {
      if (override[key] !== undefined && override[key] !== preset[key])
        throw new Error(
          `outputs.${name}.${key}: built-in dimensions and constraints are fixed. Use a custom output name.`,
        );
    }
  }
  return outputSchema.parse({ ...preset, ...override });
}
