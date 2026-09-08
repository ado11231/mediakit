# Expo fixture entry

These files demonstrate the app integration. They use your installed Expo, React Native,
and expo-font versions. They are not a second application bundled into mediakit.

1. Create a separate Expo fixture project beside your app, using the same native dependencies.
2. Set its package.json `main` to `entry.ts`. Copy this entry and configuration into it.
3. Import your real screen components in place of Dashboard. Supply sample data through props
   or fixture providers. Keep production authentication, database clients, and analytics out
   of the fixture entry and its imports.
4. Point both useFonts and mediakit.config.ts at your app's actual font assets. The relative
   font paths here refer to the repository's shared example fonts.
5. Give the fixture project a separate scheme and bundle identifier ending in `.mediakit`.
6. Build and install it once with `npx expo run:ios --configuration Release --device`.
   Select the same simulator in mediakit.config.ts. Rebuild after native or fixture source changes.
7. Install Maestro, then run `npx mediakit preview` or `npx mediakit export`.

A release fixture build embeds its JS and assets, avoiding Metro connectivity and development
menus during capture. This example hides the system status bar; the compositor adds only a
bezel, so it never duplicates a status bar or island.

Each capture opens the scene through a deep link and waits for its exact ready testID. For
screens with images or asynchronous local resources, delay readiness until they finish.
Use request.time, request.locale, request.timezone, request.theme, and
createFixtureRandom(request.seed) when your screen depends on them. Do not call live services.

A query flag in your production app is insufficient isolation. Screens that initialize
production clients directly need that initialization moved behind a replaceable provider.

Expo custom entries: https://docs.expo.dev/versions/latest/sdk/expo/#registerrootcomponent
Maestro setup: https://docs.maestro.dev/maestro-cli/
