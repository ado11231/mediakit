import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createJiti } from 'jiti';
import { campaignSchema, configSchema, parseInput } from './schema.js';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export async function importSource(path: string, exportName = 'default'): Promise<unknown> {
  const loader = createJiti(import.meta.url, {
    moduleCache: false,
    fsCache: false,
    interopDefault: false,
  });
  const exports = await loader.import<Record<string, unknown>>(path);
  if (!(exportName in exports)) throw new Error(`${path}: missing export "${exportName}".`);
  return exports[exportName];
}
export async function loadProject(cwd: string, explicitPath?: string) {
  const candidates = explicitPath
    ? [resolve(cwd, explicitPath)]
    : ['ts', 'mts', 'js', 'mjs'].map((extension) =>
        resolve(cwd, `mediakit.config.${extension}`),
      );
  const paths = [];
  for (const path of candidates) if (await fileExists(path)) paths.push(path);
  if (paths.length !== 1)
    throw new Error(
      paths.length
        ? 'Multiple config files found. Pass --config <path>.'
        : `${cwd}: no mediakit config. Run mediakit init.`,
    );
  const configPath = paths[0];
  if (!configPath) throw new Error('No config path.');
  const config = parseInput(configSchema, await importSource(configPath), configPath);
  const root = dirname(configPath);
  const campaignPath =
    typeof config.campaign === 'string' ? resolve(root, config.campaign) : configPath;
  const campaign =
    typeof config.campaign === 'string'
      ? parseInput(campaignSchema, await importSource(campaignPath), campaignPath)
      : config.campaign;
  return { root, configPath, campaignPath, config, campaign };
}
export type Project = Awaited<ReturnType<typeof loadProject>>;
