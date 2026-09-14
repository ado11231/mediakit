import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import sharp from 'sharp';
import type { Browser } from 'playwright';
import type { Config } from './schema.js';
import { captureEnvironment, runCommand, stopProcess } from './process.js';
import { fixtureReadyId } from './fixtures.js';

export interface ScreenCapture {
  data: Buffer;
  width: number;
  height: number;
  environment: Record<string, unknown>;
}
export function fixtureUrl(
  base: string,
  scene: string,
  fixture: string,
  config: Config,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries({ scene, fixture, ...config.environment }))
    url.searchParams.set(key, String(value));
  return url.href;
}
export function createIosFlow(
  appId: string,
  readyId: string,
  screenshot: string,
  timeout: number,
): string {
  return `appId: ${JSON.stringify(appId)}\n---\n- extendedWaitUntil:\n    visible:\n      id: ${JSON.stringify(readyId)}\n    timeout: ${timeout}\n- takeScreenshot: ${JSON.stringify(screenshot)}\n`;
}
export class CaptureSession {
  readonly files = new Set<string>();
  private readonly captures = new Map<string, ScreenCapture>();
  private readonly servers = new Map<string, ChildProcess>();
  constructor(
    private readonly config: Config,
    private readonly root: string,
    private readonly browser: Browser,
  ) {}

  async get(name: string, fixture = 'default'): Promise<ScreenCapture> {
    const key = `${name}:${fixture}`;
    const cached = this.captures.get(key);
    if (cached) return cached;
    const screen = this.config.screens[name];
    if (!screen)
      throw new Error(
        `screens.${name}: unknown screen. Register an image, web scene, or iOS scene.`,
      );
    let data: Buffer;
    let environment: Record<string, unknown> = {};
    if (screen.type === 'image') {
      const path = resolve(this.root, screen.path);
      this.files.add(path);
      data = await readFile(path);
    } else if (screen.type === 'web') {
      const target = this.config.capture[screen.target];
      if (target?.type !== 'web')
        throw new Error(`capture.${screen.target}: expected a web target.`);
      const origin = new URL(target.url);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
        !['http:', 'https:'].includes(origin.protocol)
      )
        throw new Error(`capture.${screen.target}: fixture URLs must use localhost.`);
      await this.startServer(screen.target, target);
      const context = await this.browser.newContext({
        viewport: { width: screen.width, height: screen.height },
        deviceScaleFactor: screen.scale,
        locale: this.config.environment.locale,
        timezoneId: this.config.environment.timezone,
        colorScheme: this.config.environment.theme,
        serviceWorkers: 'block',
      });
      try {
        const failures: string[] = [];
        await context.route('**/*', async (route) => {
          const request = route.request();
          const allowed =
            new URL(request.url()).origin === origin.origin &&
            request.method() === 'GET' &&
            ['document', 'script', 'stylesheet', 'image', 'font', 'media', 'manifest'].includes(
              request.resourceType(),
            );
          if (allowed) await route.continue();
          else {
            failures.push(`${request.method()} ${request.url()}`);
            await route.abort();
          }
        });
        await context.routeWebSocket('**/*', (socket) => {
          failures.push(`WebSocket ${socket.url()}`);
          void socket.close();
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => {
          failures.push(error.message);
        });
        page.on('response', (response) => {
          if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
        });
        await page.clock.setFixedTime(new Date(this.config.environment.time));
        await page.addInitScript((seed) => {
          let state = seed >>> 0;
          // eslint-disable-next-line no-restricted-properties -- Replace entropy with the configured fixture seed.
          Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
          };
        }, this.config.environment.seed);
        const url = fixtureUrl(target.url, screen.scene, fixture, this.config);
        await page.goto(url, { waitUntil: 'load', timeout: this.config.environment.timeout });
        const readyId = fixtureReadyId({
          scene: screen.scene,
          fixture,
          ...this.config.environment,
        });
        await page.waitForFunction(
          (id) => document.documentElement.dataset.mediakitReady === id,
          readyId,
          { timeout: this.config.environment.timeout },
        );
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images).map((image) => image.decode()));
        });
        data = await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          scale: 'device',
        });
        if (failures.length)
          throw new Error(
            `Fixture ${name}: unexpected requests or errors:\n${failures.join('\n')}`,
          );
        environment = {
          type: 'web',
          browser: this.browser.version(),
          viewport: { width: screen.width, height: screen.height },
          scale: screen.scale,
          scene: screen.scene,
          fixture,
          ...this.config.environment,
        };
      } finally {
        await context.close();
      }
    } else {
      const target = this.config.capture[screen.target];
      if (target?.type !== 'ios')
        throw new Error(`capture.${screen.target}: expected an iOS target.`);
      if (process.platform !== 'darwin')
        throw new Error('iOS capture requires macOS, Xcode, and an iOS simulator.');
      if (!target.appId.endsWith('.mediakit'))
        throw new Error(
          'Use a dedicated fixture app identifier ending in .mediakit. Do not target your production app.',
        );
      const deviceData = z
        .object({
          devices: z.record(
            z.string(),
            z.array(
              z.object({
                udid: z.string(),
                name: z.string(),
                state: z.string(),
                isAvailable: z.boolean(),
              }),
            ),
          ),
        })
        .parse(
          JSON.parse(
            await runCommand(
              'xcrun',
              ['simctl', 'list', 'devices', 'available', '--json'],
              this.root,
            ),
          ),
        );
      const matches = Object.entries(deviceData.devices).flatMap(([runtime, devices]) =>
        devices
          .filter(
            (device) =>
              device.isAvailable &&
              (device.udid === target.simulator || device.name === target.simulator),
          )
          .map((device) => ({ ...device, runtime })),
      );
      if (matches.length !== 1 || !matches[0])
        throw new Error(
          `capture.${screen.target}.simulator: choose one available simulator UUID; found ${matches.length} matches.`,
        );
      const device = matches[0];
      const maestroVersion = (await runCommand('maestro', ['--version'], this.root)).trim();
      if (device.state !== 'Booted')
        await runCommand('xcrun', ['simctl', 'boot', device.udid], this.root);
      await runCommand('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], this.root, 120000);
      if (target.appPath)
        await runCommand(
          'xcrun',
          ['simctl', 'install', device.udid, resolve(this.root, target.appPath)],
          this.root,
          120000,
        );
      await runCommand(
        'xcrun',
        ['simctl', 'get_app_container', device.udid, target.appId, 'app'],
        this.root,
      );
      const directory = await mkdtemp(join(tmpdir(), 'mediakit-ios-'));
      try {
        const screenshot = 'screen';
        const outputDirectory = join(directory, 'output');
        const flow = join(directory, 'capture.yaml');
        const url = fixtureUrl(
          `${target.scheme}://capture`,
          screen.scene,
          fixture,
          this.config,
        );
        const readyId = fixtureReadyId({
          scene: screen.scene,
          fixture,
          ...this.config.environment,
        });
        await runCommand(
          'xcrun',
          ['simctl', 'terminate', device.udid, target.appId],
          this.root,
        ).catch((error: unknown) => {
          if (
            !(error instanceof Error) ||
            !/found nothing|not running|No such process/.test(error.message)
          )
            throw error;
        });
        // simctl delivers the launch URL without a language-dependent system confirmation.
        await runCommand('xcrun', ['simctl', 'openurl', device.udid, url], this.root);
        await writeFile(
          flow,
          createIosFlow(target.appId, readyId, screenshot, this.config.environment.timeout),
        );
        await runCommand(
          'maestro',
          ['--device', device.udid, 'test', '--test-output-dir', outputDirectory, flow],
          this.root,
          120000,
        );
        const screenshots = (await readdir(outputDirectory, { recursive: true })).filter(
          (path) => path === 'screen.png' || path.endsWith('/screen.png'),
        );
        if (screenshots.length !== 1 || !screenshots[0])
          throw new Error('Maestro did not produce exactly one screen.png capture.');
        data = await readFile(join(outputDirectory, screenshots[0]));
        environment = {
          type: 'ios',
          maestro: maestroVersion,
          simulator: device.name,
          runtime: device.runtime,
          appId: target.appId,
          scene: screen.scene,
          fixture,
          ...this.config.environment,
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    const metadata = await sharp(data).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error(`screens.${name}: could not read image dimensions.`);
    const capture = {
      data,
      width: metadata.width,
      height: metadata.height,
      environment,
    };
    this.captures.set(key, capture);
    return capture;
  }
  private async startServer(
    name: string,
    target: Extract<Config['capture'][string], { type: 'web' }>,
  ): Promise<void> {
    if (this.servers.has(name) || !target.command) return;
    const [command, ...args] = target.command;
    if (!command) throw new Error(`capture.${name}.command is empty.`);
    const child = spawn(command, args, {
      cwd: this.root,
      env: captureEnvironment(target.env),
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    this.servers.set(name, child);
    let failure: Error | undefined;
    child.on('error', (error) => {
      failure = error;
    });
    for (let elapsed = 0; elapsed < this.config.environment.timeout; elapsed += 100) {
      if (failure) throw failure;
      if (child.exitCode !== null)
        throw new Error(
          `capture.${name}: fixture server exited ${child.exitCode}. Run its command to inspect the error.`,
        );
      try {
        const response = await fetch(target.url, { signal: AbortSignal.timeout(500) });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        /* The owned fixture server may still be starting. */
      }
      await delay(100);
    }
    throw new Error(`capture.${name}: fixture server did not become ready.`);
  }
  close(): void {
    for (const child of this.servers.values()) stopProcess(child);
    this.servers.clear();
  }
}
