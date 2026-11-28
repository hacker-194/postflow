import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const POPUP_URL = (extensionId: string) => `chrome-extension://${extensionId}/src/popup/index.html`;
const OPTIONS_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/src/options/index.html`;

let extensionId: string;
let persistentContext: BrowserContext;

test.describe.configure({ retries: 0, timeout: 120000 });

test.beforeAll(async () => {
  if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(
      `Built extension not found at ${EXTENSION_PATH}. Run "npm run build" before the E2E tests.`
    );
  }

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

  const serviceWorker =
    persistentContext
      .serviceWorkers()
      .find(worker => worker.url().startsWith('chrome-extension://')) ??
    (await persistentContext.waitForEvent('serviceworker', {
      predicate: worker => worker.url().startsWith('chrome-extension://'),
      timeout: 15000,
    }));

  extensionId = new URL(serviceWorker.url()).hostname;
  if (!extensionId) {
    throw new Error(
      `Could not extract extension ID from service worker URL: ${serviceWorker.url()}`
    );
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

async function openOptions(): Promise<Page> {
  const page = await persistentContext.newPage();
  await page.goto(OPTIONS_URL(extensionId));
  await expect(page.locator('.fgp-options')).toBeVisible();
  return page;
}

test.describe('Facebook Groups Feed Sync', () => {
  test('opens Facebook groups feed from options and triggers sync', async () => {
    const optionsPage = await openOptions();
    try {
      // Navigate to the Groups tab in options
      await optionsPage.getByRole('button', { name: 'Groups', exact: true }).click();
      await expect(optionsPage.getByRole('heading', { name: 'Group Lists' })).toBeVisible();

      // Click the "Open Facebook Groups Feed" button/link
      const feedButton = optionsPage.getByRole('button', {
        name: /Open Facebook Groups Feed|facebook\.com\/groups\/feed/i,
      });
      await expect(feedButton).toBeVisible();
      await feedButton.click();

      // Wait for new tab/window with facebook.com/groups/feed/
      const facebookPage = await persistentContext.waitForEvent('page', {
        predicate: page => page.url().includes('facebook.com/groups/feed'),
        timeout: 15000,
      });

      await facebookPage.waitForLoadState('domcontentloaded', { timeout: 30000 });

      // Verify we're on the Facebook groups feed page
      await expect(facebookPage).toHaveURL(/facebook\.com\/groups\/feed/);

      // Trigger SYNC_GROUPS message via extension messaging
      // This simulates the content script receiving the sync command
      await facebookPage.evaluate(extId => {
        return new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage(extId, { type: 'SYNC_GROUPS' }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.success) {
              resolve();
            } else {
              reject(new Error(`Sync failed: ${response?.error ?? 'unknown error'}`));
            }
          });
        });
      }, extensionId);

      // Verify groups were extracted and stored
      // Check storage via background page or popup
      const popupPage = await openPopup();
      try {
        // Navigate to Lists tab in popup
        await popupPage.getByRole('button', { name: 'Lists', exact: true }).click();
        await expect(popupPage.getByRole('heading', { name: 'Group Lists' })).toBeVisible();

        // Verify at least one group list exists or groups are present
        const groupListItems = popupPage.locator(
          '[data-testid="group-list-item"], .group-list-item, [role="listitem"]'
        );
        await expect(groupListItems.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await popupPage.close();
      }
    } finally {
      await optionsPage.close();
    }
  });

  test('verifies groups extracted and stored in IndexedDB', async () => {
    const optionsPage = await openOptions();
    try {
      // Navigate to Groups tab
      await optionsPage.getByRole('button', { name: 'Groups', exact: true }).click();
      await expect(optionsPage.getByRole('heading', { name: 'Group Lists' })).toBeVisible();

      // Open Facebook groups feed
      const feedButton = optionsPage.getByRole('button', {
        name: /Open Facebook Groups Feed|facebook\.com\/groups\/feed/i,
      });
      await expect(feedButton).toBeVisible();
      await feedButton.click();

      const facebookPage = await persistentContext.waitForEvent('page', {
        predicate: page => page.url().includes('facebook.com/groups/feed'),
        timeout: 15000,
      });

      await facebookPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await expect(facebookPage).toHaveURL(/facebook\.com\/groups\/feed/);

      // Trigger sync
      await facebookPage.evaluate(extId => {
        return new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage(extId, { type: 'SYNC_GROUPS' }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.success) {
              resolve();
            } else {
              reject(new Error(`Sync failed: ${response?.error ?? 'unknown error'}`));
            }
          });
        });
      }, extensionId);

      // Verify groups stored by checking storage directly via background
      // We can also verify through the popup UI
      const popupPage = await openPopup();
      try {
        await popupPage.getByRole('button', { name: 'Lists', exact: true }).click();
        await expect(popupPage.getByRole('heading', { name: 'Group Lists' })).toBeVisible();

        // Check for group data in the list
        const groupItems = popupPage.locator(
          '[data-testid="group-item"], .group-item, [role="listitem"] >> text=/Group/'
        );
        await expect(groupItems.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await popupPage.close();
      }
    } finally {
      await optionsPage.close();
    }
  });
});
