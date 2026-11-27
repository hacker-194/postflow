import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const POPUP_URL = (extensionId: string) => `chrome-extension://${extensionId}/popup.html`;

let extensionId: string;
let persistentContext: BrowserContext;

test.describe.configure({ retries: 0, timeout: 60000 });

test.beforeAll(async () => {
  if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(`Built extension not found at ${EXTENSION_PATH}. Run "npm run build" before the E2E tests.`);
  }

  // Chromium extensions require a persistent, headed context. In CI, run this
  // suite under Xvfb (see the e2e job in .github/workflows/ci.yml).
  persistentContext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // Manifest V3 background pages are service workers, not background pages.
  // Wait for the worker event instead of relying on a fixed sleep or tab URL.
  const serviceWorker =
    persistentContext.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://')) ??
    await persistentContext.waitForEvent('serviceworker', {
      predicate: worker => worker.url().startsWith('chrome-extension://'),
      timeout: 15000,
    });

  extensionId = new URL(serviceWorker.url()).hostname;
  if (!extensionId) {
    throw new Error(`Could not extract extension ID from service worker URL: ${serviceWorker.url()}`);
  }
});

test.afterAll(async () => {
  await persistentContext?.close();
});

async function openPopup(): Promise<Page> {
  const page = await persistentContext.newPage();
  await page.goto(POPUP_URL(extensionId));
  await expect(page.locator('.fgp-popup')).toBeVisible();
  return page;
}

test.describe('Extension Popup', () => {
  test('loads without errors', async () => {
    const page = await openPopup();
    try {
      await expect(page.getByText('Free Group Poster', { exact: true })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('shows dashboard by default', async () => {
    const page = await openPopup();
    try {
      await expect(page.getByText('Dashboard', { exact: true })).toBeVisible();
      await expect(page.getByText('Group Lists', { exact: true })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('navigates between tabs', async () => {
    const page = await openPopup();
    try {
      await page.getByRole('button', { name: 'Lists' }).click();
      await expect(page.getByRole('heading', { name: 'Group Lists' })).toBeVisible();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    } finally {
      await page.close();
    }
  });
});
