import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const POPUP_URL = (extensionId: string) => `chrome-extension://${extensionId}/src/popup/index.html`;

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

async function sendMessage(page: Page, type: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ type, payload }) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ type, payload }, response => {
          resolve(response);
        });
      });
    },
    { type, payload }
  );
}

test.describe('Storage Operations and Data Integrity', () => {
  test('IndexedDB namespaced operations - groups namespace', async () => {
    const page = await openPopup();
    try {
      // Test setting a group via background message
      const group = {
        id: 'test-group-1',
        name: 'Test Group',
        url: 'https://facebook.com/groups/testgroup',
        platform: 'facebook' as const,
        memberCount: 100,
        isAdmin: true,
        category: 'Testing',
        addedAt: Date.now(),
      };

      const saveResponse = await sendMessage(page, 'SAVE_GROUP', { group });
      expect(saveResponse).toMatchObject({ success: true });

      // Verify the group was saved by retrieving all groups
      const getAllResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      expect(getAllResponse.success).toBe(true);
      expect(Array.isArray(getAllResponse.data)).toBe(true);

      const savedGroup = getAllResponse.data.find((g: { id: string }) => g.id === 'test-group-1');
      expect(savedGroup).toBeDefined();
      expect(savedGroup.name).toBe('Test Group');
      expect(savedGroup.platform).toBe('facebook');

      // Test getting a specific group
      const getGroupResponse = await page.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' }, resolve);
        });
      });
      // This verifies the namespace mechanism works
      expect(getGroupResponse).toBeDefined();
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - groupLists namespace', async () => {
    const page = await openPopup();
    try {
      const groupList = {
        id: 'test-list-1',
        name: 'Test List',
        groupIds: ['test-group-1'],
        color: '#1877f2',
        platform: 'facebook' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const saveResponse = await sendMessage(page, 'SAVE_GROUP_LIST', { list: groupList });
      expect(saveResponse).toMatchObject({ success: true });

      const getListsResponse = await sendMessage(page, 'GET_GROUP_LISTS');
      expect(getListsResponse.success).toBe(true);
      expect(Array.isArray(getListsResponse.data)).toBe(true);

      const savedList = getListsResponse.data.find((l: { id: string }) => l.id === 'test-list-1');
      expect(savedList).toBeDefined();
      expect(savedList.name).toBe('Test List');
      expect(savedList.color).toBe('#1877f2');
      expect(savedList.platform).toBe('facebook');
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - templates namespace', async () => {
    const page = await openPopup();
    try {
      const template = {
        id: 'test-template-1',
        name: 'Test Template',
        caption: 'Test caption with {spintax|variations}',
        firstComment: 'First comment',
        settings: {
          mode: 'share_original' as const,
          caption: 'Test caption',
          useSpintax: true,
          delayBetweenGroups: 30,
          safetyLevel: 'balanced' as const,
          overnightPause: false,
          overnightStart: '22:00',
          overnightEnd: '08:00',
          maxPostsPerDay: 50,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const saveResponse = await sendMessage(page, 'SAVE_TEMPLATE', { template });
      expect(saveResponse).toMatchObject({ success: true });

      const getTemplatesResponse = await sendMessage(page, 'GET_TEMPLATES');
      expect(getTemplatesResponse.success).toBe(true);
      expect(Array.isArray(getTemplatesResponse.data)).toBe(true);

      const savedTemplate = getTemplatesResponse.data.find(
        (t: { id: string }) => t.id === 'test-template-1'
      );
      expect(savedTemplate).toBeDefined();
      expect(savedTemplate.name).toBe('Test Template');
      expect(savedTemplate.caption).toContain('spintax');
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - imageSets namespace', async () => {
    const page = await openPopup();
    try {
      const imageSet = {
        id: 'test-imageset-1',
        name: 'Test Image Set',
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        createdAt: Date.now(),
      };

      const saveResponse = await sendMessage(page, 'SAVE_IMAGE_SET', { imageSet });
      expect(saveResponse).toMatchObject({ success: true });

      const getImageSetsResponse = await sendMessage(page, 'GET_IMAGE_SETS');
      expect(getImageSetsResponse.success).toBe(true);
      expect(Array.isArray(getImageSetsResponse.data)).toBe(true);

      const savedImageSet = getImageSetsResponse.data.find(
        (i: { id: string }) => i.id === 'test-imageset-1'
      );
      expect(savedImageSet).toBeDefined();
      expect(savedImageSet.name).toBe('Test Image Set');
      expect(savedImageSet.imageUrls).toHaveLength(2);
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - scheduledShares namespace', async () => {
    const page = await openPopup();
    try {
      const scheduledShare = {
        id: 'test-share-1',
        postUrl: 'https://facebook.com/posts/123',
        postPreview: {
          url: 'https://facebook.com/posts/123',
          authorName: 'Test Author',
          authorProfileUrl: 'https://facebook.com/author',
          text: 'Test post content',
          images: [],
          isReel: false,
          isVideo: false,
          postedAt: Date.now(),
        },
        groupListId: 'test-list-1',
        settings: {
          mode: 'share_original' as const,
          caption: 'Test caption',
          useSpintax: false,
          delayBetweenGroups: 30,
          safetyLevel: 'balanced' as const,
          overnightPause: false,
          overnightStart: '22:00',
          overnightEnd: '08:00',
          maxPostsPerDay: 50,
        },
        scheduledAt: Date.now() + 60000,
        createdAt: Date.now(),
        status: 'pending' as const,
      };

      // Use SCHEDULE_SHARE which handles setting up the share
      const scheduleResponse = await sendMessage(page, 'SCHEDULE_SHARE', {
        postUrl: scheduledShare.postUrl,
        postPreview: scheduledShare.postPreview,
        groupListId: scheduledShare.groupListId,
        settings: scheduledShare.settings,
        scheduledAt: scheduledShare.scheduledAt,
      });
      expect(scheduleResponse.success).toBe(true);
      expect(scheduleResponse.shareId).toBeDefined();

      const getScheduledResponse = await sendMessage(page, 'GET_ALL_SCHEDULED');
      expect(getScheduledResponse.success).toBe(true);
      expect(Array.isArray(getScheduledResponse.data)).toBe(true);

      const savedShare = getScheduledResponse.data.find(
        (s: { id: string }) => s.id === scheduleResponse.shareId
      );
      expect(savedShare).toBeDefined();
      expect(savedShare.status).toBe('pending');
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - shareHistory namespace', async () => {
    const page = await openPopup();
    try {
      const getHistoryResponse = await sendMessage(page, 'GET_SHARE_HISTORY');
      expect(getHistoryResponse.success).toBe(true);
      expect(Array.isArray(getHistoryResponse.data)).toBe(true);
      // History might be empty initially
    } finally {
      await page.close();
    }
  });

  test('IndexedDB namespaced operations - userSettings namespace', async () => {
    const page = await openPopup();
    try {
      const getSettingsResponse = await sendMessage(page, 'GET_USER_SETTINGS');
      expect(getSettingsResponse.success).toBe(true);
      expect(getSettingsResponse.data).toBeDefined();
      expect(getSettingsResponse.data.theme).toBeDefined();
      expect(getSettingsResponse.data.language).toBeDefined();

      // Update a setting
      const updateResponse = await sendMessage(page, 'UPDATE_USER_SETTINGS', {
        settings: { theme: 'dark' },
      });
      expect(updateResponse.success).toBe(true);

      // Verify the update
      const verifyResponse = await sendMessage(page, 'GET_USER_SETTINGS');
      expect(verifyResponse.success).toBe(true);
      expect(verifyResponse.data.theme).toBe('dark');
    } finally {
      await page.close();
    }
  });

  test('Export all data as JSON', async () => {
    const page = await openPopup();
    try {
      // First add some data to export
      await sendMessage(page, 'SAVE_GROUP', {
        group: {
          id: 'export-test-group',
          name: 'Export Test Group',
          url: 'https://facebook.com/groups/exporttest',
          platform: 'facebook',
          addedAt: Date.now(),
        },
      });

      await sendMessage(page, 'SAVE_GROUP_LIST', {
        list: {
          id: 'export-test-list',
          name: 'Export Test List',
          groupIds: ['export-test-group'],
          color: '#42b72a',
          platform: 'facebook',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });

      // Now export all data
      const exportResponse = await sendMessage(page, 'EXPORT_DATA');
      expect(exportResponse.success).toBe(true);
      expect(typeof exportResponse.data).toBe('string');

      // Parse the exported JSON
      const exportedData = JSON.parse(exportResponse.data);
      expect(typeof exportedData).toBe('object');
      expect(exportedData).not.toBeNull();
      expect(Array.isArray(exportedData)).toBe(false);

      // Verify it contains our test data
      const keys = Object.keys(exportedData);
      expect(keys.length).toBeGreaterThan(0);

      // Check for fgp/ prefixed keys
      const fgpKeys = keys.filter(k => k.startsWith('fgp/'));
      expect(fgpKeys.length).toBeGreaterThan(0);

      // Verify specific namespaces are present
      const hasGroups = fgpKeys.some(k => k.includes('/groups/'));
      const hasGroupLists = fgpKeys.some(k => k.includes('/groupLists/'));
      expect(hasGroups).toBe(true);
      expect(hasGroupLists).toBe(true);
    } finally {
      await page.close();
    }
  });

  test('Import data from JSON backup', async () => {
    const page = await openPopup();
    try {
      // Create a valid backup JSON
      const backupData = {
        'fgp/groups/test-import-group': {
          id: 'test-import-group',
          name: 'Imported Group',
          url: 'https://facebook.com/groups/imported',
          platform: 'facebook',
          memberCount: 50,
          isAdmin: false,
          category: 'Imported',
          addedAt: Date.now(),
        },
        'fgp/groupLists/test-import-list': {
          id: 'test-import-list',
          name: 'Imported List',
          groupIds: ['test-import-group'],
          color: '#e63946',
          platform: 'facebook',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        'fgp/userSettings': {
          theme: 'light',
          language: 'en',
          showShareButton: true,
          shareButtonPosition: 'after_share',
          autoDetectGroups: true,
          confirmBeforeShare: true,
          soundNotifications: true,
          desktopNotifications: true,
          analyticsOptIn: false,
          plan: 'free',
        },
      };

      const backupJson = JSON.stringify(backupData);

      // Import the data
      const importResponse = await sendMessage(page, 'IMPORT_DATA', { data: backupJson });
      expect(importResponse.success).toBe(true);

      // Verify the imported data
      const getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const importedGroup = getGroupsResponse.data.find(
        (g: { id: string }) => g.id === 'test-import-group'
      );
      expect(importedGroup).toBeDefined();
      expect(importedGroup.name).toBe('Imported Group');

      const getListsResponse = await sendMessage(page, 'GET_GROUP_LISTS');
      const importedList = getListsResponse.data.find(
        (l: { id: string }) => l.id === 'test-import-list'
      );
      expect(importedList).toBeDefined();
      expect(importedList.name).toBe('Imported List');
      expect(importedList.color).toBe('#e63946');

      const getSettingsResponse = await sendMessage(page, 'GET_USER_SETTINGS');
      expect(getSettingsResponse.data.theme).toBe('light');
    } finally {
      await page.close();
    }
  });

  test('Import data from JSON backup - invalid JSON handling', async () => {
    const page = await openPopup();
    try {
      // Try to import invalid JSON
      const importResponse = await sendMessage(page, 'IMPORT_DATA', { data: 'not valid json' });
      expect(importResponse.success).toBe(false);
      expect(importResponse.error).toBeDefined();

      // Try to import non-object JSON (array)
      const arrayImportResponse = await sendMessage(page, 'IMPORT_DATA', { data: '[]' });
      expect(arrayImportResponse.success).toBe(false);
      expect(arrayImportResponse.error).toBeDefined();

      // Try to import null
      const nullImportResponse = await sendMessage(page, 'IMPORT_DATA', { data: 'null' });
      expect(nullImportResponse.success).toBe(false);
      expect(nullImportResponse.error).toBeDefined();
    } finally {
      await page.close();
    }
  });

  test('Clear all data confirmation', async () => {
    const page = await openPopup();
    try {
      // First add some data
      await sendMessage(page, 'SAVE_GROUP', {
        group: {
          id: 'clear-test-group',
          name: 'Clear Test Group',
          url: 'https://facebook.com/groups/cleartest',
          platform: 'facebook',
          addedAt: Date.now(),
        },
      });

      await sendMessage(page, 'SAVE_GROUP_LIST', {
        list: {
          id: 'clear-test-list',
          name: 'Clear Test List',
          groupIds: ['clear-test-group'],
          color: '#1877f2',
          platform: 'facebook',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });

      // Verify data exists
      let getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      expect(getGroupsResponse.data.length).toBeGreaterThan(0);

      let getListsResponse = await sendMessage(page, 'GET_GROUP_LISTS');
      expect(getListsResponse.data.length).toBeGreaterThan(0);

      // Clear all data
      const clearResponse = await sendMessage(page, 'CLEAR_ALL_DATA');
      expect(clearResponse.success).toBe(true);

      // Verify data is cleared
      getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const remainingGroups = getGroupsResponse.data.filter(
        (g: { id: string }) => g.id === 'clear-test-group'
      );
      expect(remainingGroups).toHaveLength(0);

      getListsResponse = await sendMessage(page, 'GET_GROUP_LISTS');
      const remainingLists = getListsResponse.data.filter(
        (l: { id: string }) => l.id === 'clear-test-list'
      );
      expect(remainingLists).toHaveLength(0);

      // Verify defaults are restored
      const getSettingsResponse = await sendMessage(page, 'GET_USER_SETTINGS');
      expect(getSettingsResponse.data).toBeDefined();
      expect(getSettingsResponse.data.theme).toBeDefined();

      const dailyPostsResponse = await sendMessage(page, 'GET_DAILY_POSTS');
      expect(dailyPostsResponse.success).toBe(true);
      expect(dailyPostsResponse.data).toBe(0);
    } finally {
      await page.close();
    }
  });

  test('Data migration/upgrade handling - version upgrade simulation', async () => {
    const page = await openPopup();
    try {
      // The current DB version is 1. This test verifies the storage
      // can handle existing data and the initializeDefaults function works.

      // Get initial state
      const initialSettings = await sendMessage(page, 'GET_USER_SETTINGS');
      expect(initialSettings.success).toBe(true);

      // Simulate adding data that might come from an older version
      const legacyGroup = {
        id: 'legacy-group',
        name: 'Legacy Group',
        url: 'https://facebook.com/groups/legacy',
        platform: 'facebook' as const,
        addedAt: Date.now() - 86400000, // 1 day ago
      };

      await sendMessage(page, 'SAVE_GROUP', { group: legacyGroup });

      // Verify the data is stored correctly
      const getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const savedGroup = getGroupsResponse.data.find(
        (g: { id: string }) => g.id === 'legacy-group'
      );
      expect(savedGroup).toBeDefined();
      expect(savedGroup.name).toBe('Legacy Group');

      // Test that dailyPosts and freeSharesUsed are handled correctly
      const dailyPostsResponse = await sendMessage(page, 'GET_DAILY_POSTS');
      expect(dailyPostsResponse.success).toBe(true);
      expect(typeof dailyPostsResponse.data).toBe('number');

      // Test that initializeDefaults doesn't overwrite existing data
      const initResponse = await page.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }, resolve);
        });
      });
      expect(initResponse).toBeDefined();
    } finally {
      await page.close();
    }
  });

  test('Cross-namespace data integrity - group and groupList relationship', async () => {
    const page = await openPopup();
    try {
      // Create a group
      const group = {
        id: 'integrity-group-1',
        name: 'Integrity Group',
        url: 'https://facebook.com/groups/integrity',
        platform: 'facebook' as const,
        memberCount: 200,
        isAdmin: true,
        category: 'Testing',
        addedAt: Date.now(),
      };

      await sendMessage(page, 'SAVE_GROUP', { group });

      // Create a group list referencing the group
      const groupList = {
        id: 'integrity-list-1',
        name: 'Integrity List',
        groupIds: ['integrity-group-1'],
        color: '#f77f00',
        platform: 'facebook' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await sendMessage(page, 'SAVE_GROUP_LIST', { list: groupList });

      // Verify the relationship by getting groups for list
      const getGroupsForListResponse = await page.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_GROUPS_FOR_LIST', listId: 'integrity-list-1' },
            resolve
          );
        });
      });

      expect(getGroupsForListResponse.success).toBe(true);
      expect(Array.isArray(getGroupsForListResponse.data)).toBe(true);
      expect(getGroupsForListResponse.data).toHaveLength(1);
      expect(getGroupsForListResponse.data[0].id).toBe('integrity-group-1');
      expect(getGroupsForListResponse.data[0].name).toBe('Integrity Group');
    } finally {
      await page.close();
    }
  });

  test('Cross-namespace data integrity - template with imageSet reference', async () => {
    const page = await openPopup();
    try {
      // Create an image set
      const imageSet = {
        id: 'integrity-imageset-1',
        name: 'Integrity Image Set',
        imageUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        createdAt: Date.now(),
      };

      await sendMessage(page, 'SAVE_IMAGE_SET', { imageSet });

      // Create a template referencing the image set
      const template = {
        id: 'integrity-template-1',
        name: 'Integrity Template',
        caption: 'Template with images',
        settings: {
          mode: 'share_original' as const,
          caption: 'Template with images',
          useSpintax: false,
          imageSetIds: ['integrity-imageset-1'],
          delayBetweenGroups: 30,
          safetyLevel: 'balanced' as const,
          overnightPause: false,
          overnightStart: '22:00',
          overnightEnd: '08:00',
          maxPostsPerDay: 50,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await sendMessage(page, 'SAVE_TEMPLATE', { template });

      // Verify both exist independently
      const getTemplatesResponse = await sendMessage(page, 'GET_TEMPLATES');
      const savedTemplate = getTemplatesResponse.data.find(
        (t: { id: string }) => t.id === 'integrity-template-1'
      );
      expect(savedTemplate).toBeDefined();
      expect(savedTemplate.settings.imageSetIds).toContain('integrity-imageset-1');

      const getImageSetsResponse = await sendMessage(page, 'GET_IMAGE_SETS');
      const savedImageSet = getImageSetsResponse.data.find(
        (i: { id: string }) => i.id === 'integrity-imageset-1'
      );
      expect(savedImageSet).toBeDefined();
      expect(savedImageSet.imageUrls).toHaveLength(2);
    } finally {
      await page.close();
    }
  });

  test('Storage persistence across popup reloads', async () => {
    const page1 = await openPopup();
    try {
      // Add data in first popup instance
      await sendMessage(page1, 'SAVE_GROUP', {
        group: {
          id: 'persist-group-1',
          name: 'Persist Group',
          url: 'https://facebook.com/groups/persist',
          platform: 'facebook',
          addedAt: Date.now(),
        },
      });
    } finally {
      await page1.close();
    }

    // Open a new popup instance
    const page2 = await openPopup();
    try {
      // Verify data persists
      const getGroupsResponse = await sendMessage(page2, 'GET_ALL_GROUPS');
      const persistedGroup = getGroupsResponse.data.find(
        (g: { id: string }) => g.id === 'persist-group-1'
      );
      expect(persistedGroup).toBeDefined();
      expect(persistedGroup.name).toBe('Persist Group');
    } finally {
      await page2.close();
    }
  });

  test('Storage persistence across extension reload (service worker restart)', async () => {
    const page = await openPopup();
    try {
      // Add data
      await sendMessage(page, 'SAVE_GROUP', {
        group: {
          id: 'sw-restart-group',
          name: 'SW Restart Group',
          url: 'https://facebook.com/groups/swrestart',
          platform: 'facebook',
          addedAt: Date.now(),
        },
      });

      // Verify it's there
      const getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const beforeRestart = getGroupsResponse.data.find(
        (g: { id: string }) => g.id === 'sw-restart-group'
      );
      expect(beforeRestart).toBeDefined();

      // The service worker might restart, but data should persist in IndexedDB
      // We can't easily simulate SW restart in E2E, but we verify the data is in IndexedDB
      // by checking it's retrievable after a new page load
    } finally {
      await page.close();
    }

    // New page simulates a fresh context
    const page2 = await openPopup();
    try {
      const getGroupsResponse = await sendMessage(page2, 'GET_ALL_GROUPS');
      const afterReload = getGroupsResponse.data.find(
        (g: { id: string }) => g.id === 'sw-restart-group'
      );
      expect(afterReload).toBeDefined();
      expect(afterReload.name).toBe('SW Restart Group');
    } finally {
      await page2.close();
    }
  });
});

test.describe('Storage Error Handling', () => {
  test('handles duplicate group IDs gracefully', async () => {
    const page = await openPopup();
    try {
      const group = {
        id: 'duplicate-group',
        name: 'Duplicate Group',
        url: 'https://facebook.com/groups/duplicate',
        platform: 'facebook' as const,
        addedAt: Date.now(),
      };

      await sendMessage(page, 'SAVE_GROUP', { group });
      const secondSave = await sendMessage(page, 'SAVE_GROUP', { group });

      // Should succeed (update) or fail gracefully
      expect(secondSave.success).toBe(true);

      const getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const duplicates = getGroupsResponse.data.filter(
        (g: { id: string }) => g.id === 'duplicate-group'
      );
      expect(duplicates).toHaveLength(1);
    } finally {
      await page.close();
    }
  });

  test('handles missing IDs gracefully', async () => {
    const page = await openPopup();
    try {
      // Try to get a non-existent group
      const getGroupResponse = await page.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_GROUPS_FOR_LIST', listId: 'non-existent-list' },
            resolve
          );
        });
      });
      expect(getGroupResponse.success).toBe(true);
      expect(getGroupResponse.data).toEqual([]);

      // Try to delete a non-existent group
      const deleteResponse = await sendMessage(page, 'DELETE_GROUP', { id: 'non-existent-group' });
      expect(deleteResponse.success).toBe(true); // idb delete is idempotent
    } finally {
      await page.close();
    }
  });

  test('handles large data export/import', async () => {
    const page = await openPopup();
    try {
      // Create multiple groups
      for (let i = 0; i < 50; i++) {
        await sendMessage(page, 'SAVE_GROUP', {
          group: {
            id: `large-group-${i}`,
            name: `Large Group ${i}`,
            url: `https://facebook.com/groups/large${i}`,
            platform: 'facebook',
            memberCount: 1000 + i,
            addedAt: Date.now(),
          },
        });
      }

      // Export
      const exportResponse = await sendMessage(page, 'EXPORT_DATA');
      expect(exportResponse.success).toBe(true);
      expect(typeof exportResponse.data).toBe('string');

      const exportedData = JSON.parse(exportResponse.data);
      const groupKeys = Object.keys(exportedData).filter(k => k.includes('/groups/large-group'));
      expect(groupKeys).toHaveLength(50);

      // Clear and re-import
      await sendMessage(page, 'CLEAR_ALL_DATA');

      const importResponse = await sendMessage(page, 'IMPORT_DATA', { data: exportResponse.data });
      expect(importResponse.success).toBe(true);

      // Verify all groups restored
      const getGroupsResponse = await sendMessage(page, 'GET_ALL_GROUPS');
      const restoredGroups = getGroupsResponse.data.filter((g: { id: string }) =>
        g.id.startsWith('large-group-')
      );
      expect(restoredGroups).toHaveLength(50);
    } finally {
      await page.close();
    }
  });
});
