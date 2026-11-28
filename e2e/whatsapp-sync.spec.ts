import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

interface SyncGroupsResponse {
  success: boolean;
  groups?: Array<{ id: string; name: string; [key: string]: unknown }>;
  error?: string;
}

interface GetGroupsResponse {
  success: boolean;
  data?: Array<{ id: string; name: string; [key: string]: unknown }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const POPUP_URL = (extensionId: string) => `chrome-extension://${extensionId}/src/popup/index.html`;
const OPTIONS_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/src/options/index.html`;

let extensionId: string;
let persistentContext: BrowserContext;

test.describe.configure({ retries: 0, timeout: 180000 });

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

async function openWhatsAppWeb(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 60000 });
  return page;
}

test.describe('WhatsApp Web Group Sync Flow', () => {
  test('opens WhatsApp Web from popup and triggers SYNC_WHATSAPP_GROUPS', async () => {
    // Step 1: Open popup
    const popup = await openPopup();

    // Step 2: Click "Sync WhatsApp" button to open WhatsApp Web
    await popup.getByRole('button', { name: /Sync WhatsApp/i }).click();

    // Step 3: Wait for WhatsApp Web tab to open
    const pages = persistentContext.pages();
    const whatsappPage = pages.find(p => p.url().includes('web.whatsapp.com'));

    if (!whatsappPage) {
      // Give time for tab to open
      await new Promise(resolve => setTimeout(resolve, 3000));
      const newPages = persistentContext.pages();
      const foundPage = newPages.find(p => p.url().includes('web.whatsapp.com'));
      if (!foundPage) {
        throw new Error('WhatsApp Web tab did not open');
      }
    }

    const waPage = whatsappPage!;

    try {
      // Step 4: Wait for WhatsApp Web to load (QR code or chat list)
      // WhatsApp Web shows QR code if not logged in, or chat list if logged in
      await waPage.waitForLoadState('domcontentloaded', { timeout: 60000 });

      // Wait for either QR code or chat list to appear
      const qrCode = waPage.locator(
        '[data-testid="qr-code"], canvas[aria-label*="QR"], .landing-wrapper'
      );
      const chatList = waPage.locator('[data-testid="chat-list"], #pane-side, [role="listitem"]');

      // Wait for page to be ready - either QR code (need scan) or chat list (already logged in)
      await Promise.race([
        qrCode
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
        chatList
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
      ]);

      // If QR code is visible, we need manual scan - wait longer
      if (
        await qrCode
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        console.log('WhatsApp Web QR code visible - waiting for manual scan...');
        // Wait for chat list to appear after QR scan (up to 120 seconds)
        await chatList.first().waitFor({ state: 'visible', timeout: 120000 });
        console.log('WhatsApp Web chat list loaded after QR scan');
      } else {
        console.log('WhatsApp Web chat list already visible (logged in)');
      }

      // Step 5: Wait for content script to load and be ready
      // The content script injects a share button when forward buttons are found
      await waPage.waitForTimeout(3000);

      // Step 6: Trigger SYNC_WHATSAPP_GROUPS from background via popup
      // We can send message directly to background or use the popup's sync mechanism
      const result = await popup.evaluate(async (_extId: string) => {
        return new Promise<SyncGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'SYNC_WHATSAPP_GROUPS' },
            (response: SyncGroupsResponse) => resolve(response)
          );
        });
      }, extensionId);

      console.log('SYNC_WHATSAPP_GROUPS result:', result);

      // Step 7: Verify sync succeeded and groups were extracted
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.groups).toBeDefined();
      expect(Array.isArray(result.groups)).toBe(true);
      expect(result.groups.length).toBeGreaterThan(0);

      // Step 8: Verify groups have expected structure
      for (const group of result.groups) {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('name');
        expect(typeof group.id).toBe('string');
        expect(typeof group.name).toBe('string');
        expect(group.id.length).toBeGreaterThan(0);
        expect(group.name.length).toBeGreaterThan(0);
      }

      // Step 9: Verify groups are stored in extension storage
      // Check by requesting stored groups
      const storedGroups = await popup.evaluate(async () => {
        return new Promise<GetGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_WHATSAPP_GROUPS' },
            (response: GetGroupsResponse) => resolve(response)
          );
        });
      });

      expect(storedGroups).toBeDefined();
      expect(storedGroups.success).toBe(true);
      expect(Array.isArray(storedGroups.data)).toBe(true);
      expect(storedGroups.data.length).toBeGreaterThan(0);

      // Verify stored groups match synced groups
      const syncedNames = result.groups?.map(g => g.name).sort() ?? [];
      const storedNames = storedGroups.data?.map(g => g.name).sort() ?? [];
      expect(storedNames).toEqual(syncedNames);
    } finally {
      await waPage.close();
      await popup.close();
    }
  });

  test('opens WhatsApp Web from options and triggers SYNC_WHATSAPP_GROUPS', async () => {
    // Step 1: Open options page
    const options = await openOptions();

    // Step 2: Find and click WhatsApp sync button
    await options.getByRole('button', { name: /Sync.*WhatsApp/i }).click();

    // Step 3: Wait for WhatsApp Web tab to open
    const pages = persistentContext.pages();
    const whatsappPage = pages.find(p => p.url().includes('web.whatsapp.com'));

    if (!whatsappPage) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const newPages = persistentContext.pages();
      const foundPage = newPages.find(p => p.url().includes('web.whatsapp.com'));
      if (!foundPage) {
        throw new Error('WhatsApp Web tab did not open from options');
      }
    }

    const waPage = whatsappPage!;

    try {
      // Step 4: Wait for WhatsApp Web to load
      await waPage.waitForLoadState('domcontentloaded', { timeout: 60000 });

      const qrCode = waPage.locator(
        '[data-testid="qr-code"], canvas[aria-label*="QR"], .landing-wrapper'
      );
      const chatList = waPage.locator('[data-testid="chat-list"], #pane-side, [role="listitem"]');

      await Promise.race([
        qrCode
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
        chatList
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
      ]);

      if (
        await qrCode
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        console.log('WhatsApp Web QR code visible - waiting for manual scan...');
        await chatList.first().waitFor({ state: 'visible', timeout: 120000 });
        console.log('WhatsApp Web chat list loaded after QR scan');
      } else {
        console.log('WhatsApp Web chat list already visible (logged in)');
      }

      await waPage.waitForTimeout(3000);

      // Step 5: Trigger SYNC_WHATSAPP_GROUPS from options
      const result = await options.evaluate(async () => {
        return new Promise<SyncGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'SYNC_WHATSAPP_GROUPS' },
            (response: SyncGroupsResponse) => resolve(response)
          );
        });
      });

      console.log('SYNC_WHATSAPP_GROUPS result from options:', result);

      // Step 6: Verify sync succeeded
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.groups).toBeDefined();
      expect(Array.isArray(result.groups)).toBe(true);
      expect(result.groups.length).toBeGreaterThan(0);

      // Step 7: Verify groups are stored
      const storedGroups = await options.evaluate(async () => {
        return new Promise<GetGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_WHATSAPP_GROUPS' },
            (response: GetGroupsResponse) => resolve(response)
          );
        });
      });

      expect(storedGroups).toBeDefined();
      expect(storedGroups.success).toBe(true);
      expect(Array.isArray(storedGroups.data)).toBe(true);
      expect(storedGroups.data.length).toBeGreaterThan(0);
    } finally {
      await waPage.close();
      await options.close();
    }
  });

  test('verifies WhatsApp content script loads on web.whatsapp.com', async () => {
    // Open WhatsApp Web directly
    const waPage = await openWhatsAppWeb(persistentContext);

    try {
      await waPage.waitForLoadState('domcontentloaded', { timeout: 60000 });

      const qrCode = waPage.locator(
        '[data-testid="qr-code"], canvas[aria-label*="QR"], .landing-wrapper'
      );
      const chatList = waPage.locator('[data-testid="chat-list"], #pane-side, [role="listitem"]');

      await Promise.race([
        qrCode
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
        chatList
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .catch(() => {}),
      ]);

      if (
        await qrCode
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        await chatList.first().waitFor({ state: 'visible', timeout: 120000 });
      }

      // Wait for content script to initialize
      await waPage.waitForTimeout(5000);

      // Check if content script injected the share button (data-testid="fgp-share-to-groups-whatsapp")
      const shareButton = waPage.locator('[data-testid="fgp-share-to-groups-whatsapp"]');

      // The button may not be visible until forward buttons are found
      // But we can verify the content script loaded by checking for any FGP elements
      // or by checking console logs
      const consoleLogs: string[] = [];
      waPage.on('console', msg => {
        if (msg.text().includes('content-whatsapp') || msg.text().includes('FGP')) {
          consoleLogs.push(msg.text());
        }
      });

      // Force content script to check for forward buttons
      await waPage.evaluate(() => {
        // Trigger mutation observer check
        const event = new Event('mutation');
        document.body.dispatchEvent(event);
      });

      await waPage.waitForTimeout(2000);

      // Verify content script is loaded by checking for console logs
      const hasWhatsAppLogs = consoleLogs.some(log => log.includes('content-whatsapp'));
      expect(hasWhatsAppLogs).toBe(true);

      // If forward buttons exist, share button should be injected
      const forwardButtons = await waPage
        .locator('[data-testid="forward"], [data-testid="msg-forward"], [aria-label*="Forward" i]')
        .count();
      if (forwardButtons > 0) {
        await expect(shareButton).toBeVisible({ timeout: 5000 });
      }
    } finally {
      await waPage.close();
    }
  });
});

test.describe('WhatsApp Sync Edge Cases', () => {
  test('handles SYNC_WHATSAPP_GROUPS when no WhatsApp Web tab is open', async () => {
    const popup = await openPopup();

    try {
      // Close any existing WhatsApp Web tabs
      const pages = persistentContext.pages();
      for (const page of pages) {
        if (page.url().includes('web.whatsapp.com')) {
          await page.close();
        }
      }

      // Try to sync without WhatsApp Web tab open
      const result = await popup.evaluate(async () => {
        return new Promise<SyncGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'SYNC_WHATSAPP_GROUPS' },
            (response: SyncGroupsResponse) => resolve(response)
          );
        });
      });

      // Should fail with appropriate error
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No WhatsApp Web tab open');
    } finally {
      await popup.close();
    }
  });

  test('verifies groups persist after sync', async () => {
    const popup = await openPopup();

    try {
      // Get initial groups (might be empty or from previous test)
      const initialGroups = await popup.evaluate(async () => {
        return new Promise<GetGroupsResponse>(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_WHATSAPP_GROUPS' },
            (response: GetGroupsResponse) => resolve(response)
          );
        });
      });

      expect(initialGroups.success).toBe(true);

      // Open WhatsApp Web and sync
      await popup.getByRole('button', { name: /Sync WhatsApp/i }).click();

      const pages = persistentContext.pages();
      const whatsappPage = pages.find(p => p.url().includes('web.whatsapp.com'));

      if (!whatsappPage) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const newPages = persistentContext.pages();
        const foundPage = newPages.find(p => p.url().includes('web.whatsapp.com'));
        if (!foundPage) {
          throw new Error('WhatsApp Web tab did not open');
        }
      }

      const waPage = whatsappPage!;

      try {
        await waPage.waitForLoadState('domcontentloaded', { timeout: 60000 });

        const qrCode = waPage.locator(
          '[data-testid="qr-code"], canvas[aria-label*="QR"], .landing-wrapper'
        );
        const chatList = waPage.locator('[data-testid="chat-list"], #pane-side, [role="listitem"]');

        await Promise.race([
          qrCode
            .first()
            .waitFor({ state: 'visible', timeout: 30000 })
            .catch(() => {}),
          chatList
            .first()
            .waitFor({ state: 'visible', timeout: 30000 })
            .catch(() => {}),
        ]);

        if (
          await qrCode
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false)
        ) {
          await chatList.first().waitFor({ state: 'visible', timeout: 120000 });
        }

        await waPage.waitForTimeout(3000);

        // Trigger sync
        const syncResult = await popup.evaluate(async () => {
          return new Promise<SyncGroupsResponse>(resolve => {
            chrome.runtime.sendMessage(
              { type: 'SYNC_WHATSAPP_GROUPS' },
              (response: SyncGroupsResponse) => resolve(response)
            );
          });
        });

        expect(syncResult.success).toBe(true);
        expect(syncResult.groups?.length).toBeGreaterThan(0);

        // Verify groups persisted
        const finalGroups = await popup.evaluate(async () => {
          return new Promise<GetGroupsResponse>(resolve => {
            chrome.runtime.sendMessage(
              { type: 'GET_WHATSAPP_GROUPS' },
              (response: GetGroupsResponse) => resolve(response)
            );
          });
        });

        expect(finalGroups.success).toBe(true);
        expect(finalGroups.data.length).toBeGreaterThanOrEqual(syncResult.groups.length);

        // Verify group structure
        for (const group of finalGroups.data) {
          expect(group).toHaveProperty('id');
          expect(group).toHaveProperty('name');
          expect(group.platform).toBe('whatsapp');
        }
      } finally {
        await waPage.close();
      }
    } finally {
      await popup.close();
    }
  });
});
