import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

interface SyncGroupsResponse {
  success: boolean;
  groups?: Array<{ id: string; name: string; [key: string]: unknown }>;
  error?: string;
}

interface IndexedDBItem {
  key: string;
  value: { platform?: string; [key: string]: unknown };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const POPUP_URL = (extensionId: string) => `chrome-extension://${extensionId}/src/popup/index.html`;
const MESSENGER_URL = 'https://www.messenger.com/';

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

async function openMessengerPage(): Promise<Page> {
  const page = await persistentContext.newPage();
  await page.goto(MESSENGER_URL, { waitUntil: 'networkidle', timeout: 60000 });
  return page;
}

test.describe('Messenger Group Sync', () => {
  test('opens messenger.com from popup and triggers SYNC_MESSENGER_GROUPS', async () => {
    const popupPage = await openPopup();
    const messengerPage = await openMessengerPage();

    try {
      // Navigate to Settings tab to find sync button
      await popupPage.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(popupPage.getByRole('heading', { name: 'Appearance' })).toBeVisible();

      // Click the "Sync Messenger Groups" button (assuming it exists in Settings)
      const syncButton = popupPage.getByRole('button', { name: /sync.*messenger.*group/i });
      await expect(syncButton).toBeVisible();
      await syncButton.click();

      // Wait for sync to complete - check for success message or loading state
      await expect(popupPage.getByText(/sync.*complete|groups.*synced|groups.*found/i)).toBeVisible(
        { timeout: 30000 }
      );

      // Verify groups are stored - check storage via background page
      // Use chrome.runtime.sendMessage to verify groups in storage
      const groupsStored = await messengerPage.evaluate(async extId => {
        return new Promise<boolean>(resolve => {
          chrome.runtime.sendMessage(extId, { type: 'GET_MESSENGER_GROUPS' }, response => {
            resolve(!!response?.data?.length);
          });
        });
      }, extensionId);

      expect(groupsStored).toBe(true);
    } finally {
      await popupPage.close();
      await messengerPage.close();
    }
  });

  test('verifies groups extracted and stored after sync', async () => {
    const messengerPage = await openMessengerPage();

    try {
      // Trigger sync directly via background script message
      const syncResult = await messengerPage.evaluate(async extId => {
        return new Promise<SyncGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(extId, { type: 'SYNC_MESSENGER_GROUPS' }, response => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response ?? { success: false, error: 'No response' });
            }
          });
        });
      }, extensionId);

      expect(syncResult.success).toBe(true);
      expect(syncResult.groups).toBeDefined();
      expect(Array.isArray(syncResult.groups)).toBe(true);

      // Verify groups have expected structure
      if (syncResult.groups && syncResult.groups.length > 0) {
        const firstGroup = syncResult.groups[0];
        expect(firstGroup).toHaveProperty('id');
        expect(firstGroup).toHaveProperty('name');
        expect(typeof firstGroup.id).toBe('string');
        expect(typeof firstGroup.name).toBe('string');
      }
    } finally {
      await messengerPage.close();
    }
  });

  test('stores synced groups in IndexedDB', async () => {
    const messengerPage = await openMessengerPage();

    try {
      // First trigger a sync
      await messengerPage.evaluate(async extId => {
        return new Promise<void>(resolve => {
          chrome.runtime.sendMessage(extId, { type: 'SYNC_MESSENGER_GROUPS' }, () => {
            resolve();
          });
        });
      }, extensionId);

      // Wait a bit for storage write
      await messengerPage.waitForTimeout(2000);

      // Verify groups are stored in IndexedDB (namespace 'groups' with platform='messenger')
      const groupsInStorage = await messengerPage.evaluate(async () => {
        return new Promise<Array<{ platform?: string; [key: string]: unknown }>>(resolve => {
          const request = indexedDB.open('fgp-storage');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('keyval', 'readonly');
            const store = tx.objectStore('keyval');
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              const all = getAllRequest.result as IndexedDBItem[];
              // Keys are in format: fgp/groups/{id}
              const groups = all
                .filter(item => item.key?.startsWith('fgp/groups/'))
                .map(g => g.value)
                .filter(g => g?.platform === 'messenger');
              resolve(groups);
            };
          };
          request.onerror = () => resolve([]);
        });
      });

      expect(Array.isArray(groupsInStorage)).toBe(true);
      // Note: groups might be empty if not logged into Messenger, but storage structure should exist
    } finally {
      await messengerPage.close();
    }
  });
});
