# Capture real screens

Keep the existing UI and replace its data source in a dedicated fixture entry. The fixture
entry must not initialize production authentication, database SDKs, analytics, or background
jobs. Local sample data lives in memory and is reset for each scene.

## Web

Register a local fixture target and screen:

```ts
capture: {
  app: {
    type: 'web',
    url: 'http://127.0.0.1:4311',
    command: ['node', 'marketing/fixtures/server.mjs'],
  },
},
screens: {
  dashboard: {
    type: 'web', target: 'app', scene: 'dashboard',
    width: 390, height: 844, scale: 3,
  },
},
```

Omit command if you already run the fixture server. Mediakit starts and stops commands it
owns. Only an explicit environment allowlist is passed to them; additional non-secret values
can be configured in the target's env object. Production environment files must not be loaded
by the fixture server itself.

The fixture URL receives scene, fixture, time, seed, locale, timezone, and theme parameters.
Use `readFixtureRequest(location.href)` from `mediakit/fixtures`, select the corresponding
screen and `createFixtureState(fixtures, request)`, then call `markFixtureReady(request)`
after local resources have loaded.

The local fixture entry may use your own React/Vite/Next setup, but it must avoid server-side
production providers too. Capture blocks fetch/XHR, WebSockets, remote origins, and non-GET
requests. First-party documents and static assets are allowed. Browser interception cannot
isolate server-side database initialization, which must be excluded at the fixture entry.

Vite HMR must be disabled in the fixture server because it opens a WebSocket. A static built
fixture entry is preferable for repeatable captures. Fonts and images must be local.

See [the working web fixture](../examples/source-app/fixtures/server.mjs).

## Expo iOS

Use a separate fixture build with a bundle identifier ending in `.mediakit`. Build and install
it once. Give it a unique URL scheme and register both in the capture target:

```ts
capture: {
  app: {
    type: 'ios',
    appId: 'com.example.app.mediakit',
    scheme: 'example-fixtures',
    simulator: 'YOUR-SIMULATOR-UUID',
    // Optional: install an already-built simulator app before capture.
    appPath: 'build/Fixtures.app',
  },
},
screens: { dashboard: { type: 'ios', target: 'app', scene: 'dashboard' } },
```

Mediakit uses Xcode's simctl and Maestro from PATH. Use `xcrun simctl list devices available`
to find a simulator UUID. A simulator name is accepted only when it identifies exactly one
device. Capture can boot the configured simulator but does not create or download one.

Read the initial deep link and incoming link events, reset scene state, and supply fixture
props/providers. Expose `fixtureReadyId(request)` as the testID of a visible native view only
when the screen is ready. Unknown scenes and fixtures should fail instead of showing defaults.

Native code must use the provided time, seeded random generator, locale, and theme where
needed; the capture runner cannot rewrite every native clock or database SDK. Hide live status
indicators or make them fixed in the fixture build. Disable transitions and bundle assets.

See [the Expo entry example](../examples/expo-fixtures). Rebuild the fixture app after source
changes; changing marketing copy or layout does not require a native rebuild.

## Supplied screenshots

```ts
screens: { dashboard: { type: 'image', path: 'marketing/screens/dashboard.png' } },
```

This works for Android and other platforms too. Capture adapters for those platforms are not
included in this release. Images must have enough pixels for their intended displayed size;
Mediakit does not enlarge low-resolution images silently.

## Isolation limits

Fixture helpers do not magically disconnect arbitrary applications. They provide explicit
state and readiness APIs. Your fixture entry must avoid importing live data initialization.
The test suite verifies browser API requests are blocked before reaching a server. Native
capture uses the same scene/readiness contract but relies on the separate fixture build for
data isolation. Never use production credentials or seed a production database for screenshots.
