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
  const output = config.outputs[name] ?? presets[name];
  if (!output)
    throw new Error(
      `Unknown output "${name}". Choose ${Object.keys(presets).join(', ')} or configure outputs.${name}.`,
    );
  return output;
}
