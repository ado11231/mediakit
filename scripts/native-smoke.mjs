import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser } from '../packages/mediakit/dist/browser.js';
import { CaptureSession } from '../packages/mediakit/dist/capture.js';
import { configSchema } from '../packages/mediakit/dist/schema.js';
import { runCommand } from '../packages/mediakit/dist/process.js';

const simulator = process.env.MEDIAKIT_SIMULATOR;
if (!simulator)
  throw new Error(
    'Set MEDIAKIT_SIMULATOR to a dedicated iOS simulator UUID. Maestro must be on PATH.',
  );
const directory = await mkdtemp(join(tmpdir(), 'mediakit-native-test-'));
const app = join(directory, 'Fixture.app');
await mkdir(app);
const source = join(directory, 'Fixture.swift');
await writeFile(
  source,
  `import UIKit
@main
@MainActor
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  let label = UILabel()
  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    let controller = UIViewController()
    controller.view.backgroundColor = UIColor(red: 0.95, green: 0.97, blue: 0.92, alpha: 1)
    label.frame = CGRect(x: 32, y: 180, width: 330, height: 300)
    label.numberOfLines = 0
    label.font = UIFont.systemFont(ofSize: 38, weight: .bold)
    label.text = "Waiting for fixture"
    controller.view.addSubview(label)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    self.window = window
    return true
  }
  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    let values = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let scene = values.first(where: { $0.name == "scene" })?.value ?? "missing"
    let fixture = values.first(where: { $0.name == "fixture" })?.value ?? "missing"
    label.text = "Real native screen\\n\\n" + fixture
    label.accessibilityIdentifier = "mediakit-ready-" + scene + "-" + fixture
    return true
  }
}
`,
);
await writeFile(
  join(app, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleIdentifier</key><string>dev.mediakit.smoke.mediakit</string><key>CFBundleName</key><string>Mediakit Fixture</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundlePackageType</key><string>APPL</string><key>MinimumOSVersion</key><string>18.0</string><key>UIDeviceFamily</key><array><integer>1</integer></array><key>UILaunchScreen</key><dict/><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>mediakit-smoke</string></array></dict></array></dict></plist>`,
);
let browser;
try {
  console.log('Compiling the native fixture app.');
  const sdk = (
    await runCommand('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], directory)
  ).trim();
  await runCommand(
    'xcrun',
    [
      'swiftc',
      '-parse-as-library',
      '-sdk',
      sdk,
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios18.0-simulator`,
      source,
      '-o',
      join(app, 'Fixture'),
    ],
    directory,
    600000,
  );
  await runCommand('codesign', ['--force', '--sign', '-', app], directory);
  browser = await launchBrowser();
  const session = new CaptureSession(
    configSchema.parse({
      screens: { home: { type: 'ios', target: 'ios', scene: 'home' } },
      capture: {
        ios: {
          type: 'ios',
          appId: 'dev.mediakit.smoke.mediakit',
          scheme: 'mediakit-smoke',
          simulator,
          appPath: app,
        },
      },
    }),
    directory,
    browser,
  );
  console.log('Launching the simulator and capturing the fixture.');
  const capture = await session.get('home', 'sample');
  if (capture.width < 1000 || capture.height < 2000)
    throw new Error(`Unexpected native capture dimensions: ${capture.width}x${capture.height}`);
  console.log(
    `Native capture passed: ${capture.width}x${capture.height}, ${capture.environment.runtime}`,
  );
  session.close();
} finally {
  await browser?.close();
  await runCommand(
    'xcrun',
    ['simctl', 'uninstall', simulator, 'dev.mediakit.smoke.mediakit'],
    directory,
  ).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
