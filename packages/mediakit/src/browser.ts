import { chromium } from 'playwright';
export async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      'Chromium could not start. Run mediakit init --install-browser. ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
