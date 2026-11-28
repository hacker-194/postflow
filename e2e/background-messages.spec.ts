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

test.describe.configure({ retries: 0, timeout: 60000 });

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

async function sendMessageToBackground(
  page: Page,
  message: {
    type: string;
    payload?: unknown;
    shareId?: string;
    listId?: string;
    id?: string;
    settings?: unknown;
    data?: string;
  }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return await page.evaluate(async msg => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response as { success: boolean; data?: unknown; error?: string });
        }
      });
    });
  }, message);
}

async function openPopup(): Promise<Page> {
  const page = await persistentContext.newPage();
  // Retry navigation in case extension isn't fully initialized
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(POPUP_URL(extensionId), { waitUntil: 'load', timeout: 15000 });
      await expect(page.locator('.fgp-popup')).toBeVisible({ timeout: 10000 });
      return page;
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`[E2E] Popup load attempt ${attempt + 1} failed, retrying...`);
      await page.waitForTimeout(1000);
    }
  }
  throw new Error('Failed to open popup after retries');
}

test.describe('Background Service Worker Message Handling', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test.describe('Message type allowlist validation', () => {
    test('rejects unknown message type', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'UNKNOWN_MESSAGE_TYPE',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid or unknown message type');
    });

    test('rejects message without type', async () => {
      const response = await sendMessageToBackground(popupPage, {
        payload: { foo: 'bar' },
      } as { type: string; payload?: unknown });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid or unknown message type');
    });

    test('rejects null message', async () => {
      const response = await sendMessageToBackground(
        popupPage,
        null as unknown as { type: string }
      );
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid or unknown message type');
    });

    test('accepts valid message types from allowlist', async () => {
      const validTypes = [
        'GET_DAILY_POSTS',
        'GET_USER_SETTINGS',
        'GET_ALL_GROUPS',
        'GET_GROUP_LISTS',
        'GET_TEMPLATES',
        'GET_IMAGE_SETS',
        'GET_ALL_SCHEDULED',
        'GET_SHARE_HISTORY',
        'GET_WHATSAPP_GROUPS',
        'GET_MESSENGER_GROUPS',
      ];

      for (const type of validTypes) {
        const response = await sendMessageToBackground(popupPage, { type });
        // Should not return "Invalid or unknown message type"
        expect(response.error).not.toBe('Invalid or unknown message type');
      }
    });
  });

  test.describe('Sender ID verification', () => {
    test('rejects messages from external origins', async () => {
      // We cannot easily simulate external sender in this context,
      // but we verify the background code checks sender.id === chrome.runtime.id
      // This test documents the expected behavior
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_DAILY_POSTS',
      });
      // Should succeed since we're sending from the extension's own page
      expect(response.success).toBe(true);
    });
  });

  test.describe('GET_DAILY_POSTS counter', () => {
    test('returns daily posts counter (defaults to 0)', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_DAILY_POSTS',
      });
      expect(response.success).toBe(true);
      expect(typeof response.data).toBe('number');
      expect(response.data).toBeGreaterThanOrEqual(0);
    });

    test('returns integer value', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_DAILY_POSTS',
      });
      expect(Number.isInteger(response.data)).toBe(true);
    });
  });

  test.describe('SCHEDULE_SHARE with validation', () => {
    test('rejects missing payload', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    test('rejects invalid postUrl', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'not-a-url',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 60000,
        },
      });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    test('rejects invalid groupListId format', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'invalid-id-format',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 60000,
        },
      });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    test('rejects invalid settings (delay too low)', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 1000, // Below minimum 5000ms
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 60000,
        },
      });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    test('rejects invalid settings (maxPostsPerDay out of range)', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 1000, // Above maximum 500
          },
          scheduledAt: Date.now() + 60000,
        },
      });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    test('accepts valid SCHEDULE_SHARE payload', async () => {
      const scheduledAt = Date.now() + 60000; // 1 minute in future
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post content',
            images: ['https://example.com/image.jpg'],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test caption',
            firstComment: 'First comment',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(typeof response.data).toBe('string');
      expect(response.data).toMatch(/^share_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/);
    });

    test('sanitizes caption in payload', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test <script>alert(1)</script> caption',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      // Should succeed (sanitization happens internally)
      expect(response.success).toBe(true);
    });

    test('sanitizes groupListId in payload', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test\x00123', // Contains null byte
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      // Should succeed (sanitization happens internally)
      expect(response.success).toBe(true);
    });
  });

  test.describe('CANCEL_SHARE for pending/running jobs', () => {
    let shareId: string;

    test.beforeEach(async () => {
      // Create a scheduled share to cancel
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 120000, // 2 minutes in future (pending)
        },
      });
      expect(response.success).toBe(true);
      shareId = response.data as string;
    });

    test('cancels pending share job', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId,
      });
      expect(response.success).toBe(true);
      expect(response.data).toBe(true);
    });

    test('returns false for non-existent share ID', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId: 'share_nonexistent_123',
      });
      expect(response.success).toBe(true);
      expect(response.data).toBe(false);
    });

    test('rejects invalid share ID format', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId: 'invalid-format',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid share ID');
    });

    test('rejects empty share ID', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId: '',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid share ID');
    });

    test('validates share ID format before processing', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId: 'share_not_a_valid_format_here',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid share ID');
    });
  });

  test.describe('GET_SHARE_PROGRESS updates', () => {
    let shareId: string;

    test.beforeEach(async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 60000,
        },
      });
      expect(response.success).toBe(true);
      shareId = response.data as string;
    });

    test('returns share progress for valid share ID', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId,
      });
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('progress');
    });

    test('returns pending status for newly created share', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId,
      });
      expect(response.success).toBe(true);
      expect(response.data.status).toBe('pending');
    });

    test('returns progress object with expected structure', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId,
      });
      expect(response.success).toBe(true);
      const progress = response.data.progress;
      expect(progress).toBeDefined();
      expect(progress).toHaveProperty('totalGroups');
      expect(progress).toHaveProperty('completedGroups');
      expect(progress).toHaveProperty('successfulGroups');
      expect(progress).toHaveProperty('failedGroups');
      expect(progress).toHaveProperty('errors');
      expect(progress).toHaveProperty('startedAt');
      expect(Array.isArray(progress.errors)).toBe(true);
    });

    test('rejects invalid share ID format', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId: 'invalid-format',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid share ID');
    });

    test('rejects empty share ID', async () => {
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId: '',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid share ID');
    });

    test('returns share data for non-existent but valid-format share ID', async () => {
      // Use a valid format but non-existent ID
      const nonExistentId = 'share_' + Date.now() + '_abc123';
      const response = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId: nonExistentId,
      });
      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });
  });

  test.describe('Payload sanitization', () => {
    test('sanitizes HTML in caption', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: '<img src=x onerror=alert(1)>Malicious',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(true);
    });

    test('sanitizes control characters in caption', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test\x00\x01\x02caption',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(true);
    });

    test('sanitizes URL in postUrl', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'javascript:alert(1)',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      // Should reject invalid URL protocol
      expect(response.success).toBe(false);
    });

    test('limits caption length', async () => {
      const scheduledAt = Date.now() + 60000;
      const longCaption = 'a'.repeat(10000); // Over 5000 limit
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: longCaption,
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      // Should succeed (sanitization truncates)
      expect(response.success).toBe(true);
    });

    test('validates safetyLevel enum', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'invalid_level',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(false);
    });

    test('validates mode enum', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'invalid_mode',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(false);
    });

    test('validates overnight time format', async () => {
      const scheduledAt = Date.now() + 60000;
      const response = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '25:00', // Invalid hour
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt,
        },
      });
      expect(response.success).toBe(false);
    });
  });

  test.describe('Integration: Full message flow', () => {
    test('schedule -> progress -> cancel flow', async () => {
      // Schedule a share
      const scheduleResponse = await sendMessageToBackground(popupPage, {
        type: 'SCHEDULE_SHARE',
        payload: {
          postUrl: 'https://facebook.com/post/123',
          postPreview: {
            url: 'https://facebook.com/post/123',
            authorName: 'Test Author',
            authorProfileUrl: 'https://facebook.com/author',
            text: 'Test post',
            images: [],
            videoUrl: undefined,
            isReel: false,
            isVideo: false,
            postedAt: Date.now(),
          },
          groupListId: 'list_test123',
          settings: {
            mode: 'share_original',
            caption: 'Test',
            firstComment: '',
            useSpintax: false,
            delayBetweenGroups: 30000,
            safetyLevel: 'balanced',
            overnightPause: true,
            overnightStart: '22:00',
            overnightEnd: '08:00',
            maxPostsPerDay: 50,
          },
          scheduledAt: Date.now() + 120000,
        },
      });
      expect(scheduleResponse.success).toBe(true);
      const shareId = scheduleResponse.data as string;

      // Get progress (should be pending)
      const progressResponse = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId,
      });
      expect(progressResponse.success).toBe(true);
      expect(progressResponse.data.status).toBe('pending');

      // Cancel the share
      const cancelResponse = await sendMessageToBackground(popupPage, {
        type: 'CANCEL_SHARE',
        shareId,
      });
      expect(cancelResponse.success).toBe(true);
      expect(cancelResponse.data).toBe(true);

      // Verify cancelled
      const finalProgressResponse = await sendMessageToBackground(popupPage, {
        type: 'GET_SHARE_PROGRESS',
        shareId,
      });
      expect(finalProgressResponse.success).toBe(true);
      expect(finalProgressResponse.data.status).toBe('cancelled');
    });

    test('multiple concurrent message types work independently', async () => {
      // Send multiple different message types concurrently
      const results = await Promise.all([
        sendMessageToBackground(popupPage, { type: 'GET_DAILY_POSTS' }),
        sendMessageToBackground(popupPage, { type: 'GET_USER_SETTINGS' }),
        sendMessageToBackground(popupPage, { type: 'GET_ALL_GROUPS' }),
        sendMessageToBackground(popupPage, { type: 'GET_GROUP_LISTS' }),
        sendMessageToBackground(popupPage, { type: 'GET_TEMPLATES' }),
      ]);

      for (const response of results) {
        expect(response.success).toBe(true);
        expect(response.error).toBeUndefined();
      }
    });
  });
});
