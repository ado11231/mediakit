import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { platform, release } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { launchBrowser } from './browser.js';
import { CaptureSession, type ScreenCapture } from './capture.js';
import { renderSlide, type RenderedSlide } from './composition.js';
import { fileExists, type Project } from './config.js';
import { DesignResolver, slideForOutput } from './design.js';
import { resolveOutput } from './presets.js';
import type { Output } from './schema.js';

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex');
export interface OutputBundle {
  name: string;
  output: Output;
  slides: RenderedSlide[];
  document?: Buffer;
}
export interface CampaignBuild {
  bundles: OutputBundle[];
  errors: string[];
  manifest: Record<string, unknown>;
}
export interface BuildProgress {
  output: string;
  outputIndex: number;
  outputCount: number;
  slide: number;
  slideCount: number;
}

export async function buildCampaign(
  project: Project,
  onProgress?: (progress: BuildProgress) => void,
): Promise<CampaignBuild> {
  const browser = await launchBrowser();
  const resolver = new DesignResolver(project.config, project.root, browser);
  const captures = new CaptureSession(project.config, project.root, browser);
  const errors: string[] = [];
  const bundles: OutputBundle[] = [];
  const captureManifest: Record<string, unknown> = {};
  try {
    for (const [outputIndex, name] of project.campaign.outputs.entries()) {
      try {
        const output = resolveOutput(name, project.config);
        if (
          project.campaign.slides.length < output.minSlides ||
          project.campaign.slides.length > output.maxSlides
        )
          throw new Error(
            `${name}: requires ${output.minSlides} to ${output.maxSlides} slides.`,
          );
        const slides: RenderedSlide[] = [];
        const outputErrors: string[] = [];
        for (const [index, original] of project.campaign.slides.entries()) {
          onProgress?.({
            output: name,
            outputIndex: outputIndex + 1,
            outputCount: project.campaign.outputs.length,
            slide: index + 1,
            slideCount: project.campaign.slides.length,
          });
          const location = `${relative(project.root, project.campaignPath)}: ${name}, slide ${index + 1}`;
          try {
            for (const override of Object.keys(original.outputs ?? {}))
              if (!project.campaign.outputs.includes(override))
                throw new Error(`Unused output override "${override}".`);
            const slide = slideForOutput(original, name);
            const design = await resolver.resolve(slide, output, location);
            let capture: ScreenCapture | undefined;
            if (slide.screen) {
              capture = await captures.get(slide.screen, slide.fixture);
              captureManifest[`${slide.screen}:${slide.fixture ?? 'default'}`] = {
                width: capture.width,
                height: capture.height,
                sha256: sha256(capture.data),
                ...capture.environment,
              };
            }
            if (slide.crop) {
              if (!capture) throw new Error('A crop requires a screen.');
              const crop = slide.crop;
              if (crop.x + crop.width > capture.width || crop.y + crop.height > capture.height)
                throw new Error('Crop extends outside the source screen.');
              capture = {
                ...capture,
                data: await sharp(capture.data)
                  .extract({
                    left: crop.x,
                    top: crop.y,
                    width: crop.width,
                    height: crop.height,
                  })
                  .png()
                  .toBuffer(),
                width: crop.width,
                height: crop.height,
              };
            }
            const rendered = await renderSlide(
              browser,
              slide,
              output,
              design,
              resolver.fonts.values(),
              capture,
            );
            const metadata = await sharp(rendered.png).metadata();
            if (
              metadata.width !== output.width ||
              metadata.height !== output.height ||
              metadata.hasAlpha
            )
              throw new Error('Rendered PNG does not match the opaque output dimensions.');
            slides.push(rendered);
          } catch (error) {
            outputErrors.push(
              `${location}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (outputErrors.length) {
          errors.push(...outputErrors);
          continue;
        }
        const bundle: OutputBundle = { name, output, slides };
        if (output.format === 'pdf') {
          const document = await PDFDocument.create();
          document.setCreationDate(new Date('2000-01-01T00:00:00Z'));
          document.setModificationDate(new Date('2000-01-01T00:00:00Z'));
          document.setProducer('mediakit');
          document.setCreator('mediakit');
          for (const slide of slides) {
            if (!slide.pdf) throw new Error('Missing PDF page.');
            const source = await PDFDocument.load(slide.pdf, { updateMetadata: false });
            if (source.getPageCount() !== 1)
              throw new Error(`${name}: a slide produced more than one PDF page.`);
            const [page] = await document.copyPages(source, [0]);
            if (page) document.addPage(page);
          }
          bundle.document = Buffer.from(await document.save({ useObjectStreams: false }));
          if (bundle.document.length > 100_000_000)
            throw new Error(`${name}: PDF exceeds 100 MB.`);
        }
        bundles.push(bundle);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const inputFiles = new Set([
      project.configPath,
      project.campaignPath,
      ...resolver.files,
      ...captures.files,
    ]);
    const inputs: Record<string, string> = {};
    for (const path of [...inputFiles].sort())
      inputs[relative(project.root, path)] = sha256(await readFile(path));
    return {
      bundles,
      errors,
      manifest: {
        version: 1,
        campaign: project.campaign.id,
        renderer: { browser: browser.version(), platform: platform(), release: release() },
        inputs,
        campaignSpec: project.campaign,
        design: resolver.values,
        captures: captureManifest,
        outputs: bundles.map((bundle) => ({
          name: bundle.name,
          width: bundle.output.width,
          height: bundle.output.height,
          format: bundle.output.format,
          files: bundle.document
            ? [
                {
                  file: `${bundle.name}/${project.campaign.id}.pdf`,
                  sha256: sha256(bundle.document),
                },
              ]
            : bundle.slides.map((slide, index) => ({
                file: `${bundle.name}/${String(index + 1).padStart(2, '0')}.png`,
                sha256: sha256(slide.png),
              })),
        })),
      },
    };
  } finally {
    captures.close();
    await browser.close();
  }
}

export async function exportCampaign(project: Project, build: CampaignBuild): Promise<string> {
  if (build.errors.length) throw new Error(`Export aborted:\n${build.errors.join('\n')}`);
  const destination = resolve(project.root, project.config.outDir);
  const relativeDestination = relative(project.root, destination);
  if (
    !relativeDestination ||
    relativeDestination.startsWith(`..${sep}`) ||
    isAbsolute(relativeDestination) ||
    relativeDestination === '..' ||
    relativeDestination.split(sep).some((part) => part.startsWith('.'))
  )
    throw new Error('outDir must be a non-hidden child directory of the project.');
  const protectedInputs = [
    project.configPath,
    project.campaignPath,
    ...Object.values(project.config.sources).map((source) =>
      resolve(project.root, source.path),
    ),
    ...Object.values(project.config.fonts)
      .flat()
      .map((font) => resolve(project.root, font.path)),
    ...Object.values(project.config.screens).flatMap((screen) =>
      screen.type === 'image' ? [resolve(project.root, screen.path)] : [],
    ),
  ];
  if (
    protectedInputs.some((path) => path === destination || path.startsWith(destination + sep))
  )
    throw new Error('outDir contains a configured input. Choose a separate export directory.');
  await mkdir(dirname(destination), { recursive: true });
  if (await fileExists(destination)) {
    const names = await readdir(destination);
    if (names.length && !names.includes('.mediakit-output'))
      throw new Error(`${destination}: refusing to replace a directory not owned by mediakit.`);
  }
  const stage = await mkdtemp(join(dirname(destination), '.mediakit-stage-'));
  const backup = join(stage, 'previous');
  const next = join(stage, 'next');
  try {
    await mkdir(next);
    for (const bundle of build.bundles) {
      const directory = join(next, bundle.name);
      await mkdir(directory);
      if (bundle.document)
        await writeFile(join(directory, `${project.campaign.id}.pdf`), bundle.document);
      else
        for (const [index, slide] of bundle.slides.entries())
          await writeFile(
            join(directory, `${String(index + 1).padStart(2, '0')}.png`),
            slide.png,
          );
    }
    await writeFile(
      join(next, 'manifest.json'),
      JSON.stringify(build.manifest, null, 2) + '\n',
    );
    await writeFile(join(next, '.mediakit-output'), 'mediakit\n');
    if (await fileExists(destination)) await rename(destination, backup);
    try {
      await rename(next, destination);
    } catch (error) {
      if (await fileExists(backup)) await rename(backup, destination);
      throw error;
    }
  } finally {
    // Keep the backup available if a filesystem failure also prevents rollback.
    if (!(await fileExists(backup)) || (await fileExists(destination)))
      await rm(stage, { recursive: true, force: true });
  }
  return destination;
}
