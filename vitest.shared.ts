import { defineConfig } from 'vitest/config';

/**
 * Shared timeout floor for every package whose tests do real work: satori shapes text, resvg
 * rasterizes several megapixels, and the CLI suites spawn node subprocesses. Vitest's 5s
 * default is meaningless against that.
 *
 * The failure it caused is the worst kind of red: turbo runs each package's suite
 * concurrently, so an idle 2s render becomes a 10s one and correct code reports "timeout".
 * Inline per-test timeouts were the previous answer and they drift, because the number that
 * passes on a developer machine is not the number that passes on a loaded CI runner.
 *
 * A generous ceiling rather than a tuned guess: a timeout exists to stop a hang, not to
 * police render performance, which the golden-file byte comparison covers properly.
 */
export const slowSuite = defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
