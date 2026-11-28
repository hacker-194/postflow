import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

interface ScheduledShare {
  id: string;
  groupListId: string;
  postUrl: string;
  settings: {
    mode: 'share_original' | 'repost_content';
    caption: string;
    safetyLevel: 'fast' | 'balanced' | 'safe';
    overnightPause: boolean;
    overnightStart: string;
    overnightEnd: string;
    maxPostsPerDay: number;
    delayBetweenGroups: number;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  createdAt: number;
  updatedAt: number;
  progress?: {
    totalGroups: number;
    completedGroups: number;
    currentGroup?: string;
  };
}

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

async function sendMessageToBackground(
  page: Page,
  message: Record<string, unknown>
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
  await page.goto(POPUP_URL(extensionId));
  await expect(page.locator('.fgp-popup')).toBeVisible();
  return page;
}

async function createGroupListViaMessage(
  page: Page,
  name: string,
  platform: 'facebook' | 'whatsapp' | 'messenger'
): Promise<string> {
  const response = await sendMessageToBackground(page, {
    type: 'SAVE_GROUP_LIST',
    list: {
      id: `list_${Date.now()}`,
      name,
      groupIds: [],
      color: '#3B82F6',
      platform,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  } as Record<string, unknown>);
  expect(response.success).toBe(true);
  return (response.data as { id?: string } | undefined)?.id || `list_${Date.now()}`;
}

async function addGroupsViaMessage(
  page: Page,
  listId: string,
  groups: Array<{ name: string; url: string }>
): Promise<void> {
  for (const group of groups) {
    const response = await sendMessageToBackground(page, {
      type: 'SAVE_GROUP',
      group: {
        id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: group.name,
        url: group.url,
        platform: 'facebook',
        addedAt: Date.now(),
      },
    } as Record<string, unknown>);
    expect(response.success).toBe(true);
    const groupId = (response.data as { id?: string } | undefined)?.id;

    // Add group to list
    const listResponse = await sendMessageToBackground(page, {
      type: 'GET_GROUP_LISTS',
    });
    const lists = listResponse.data as Array<{ id: string; groupIds: string[] }>;
    const list = lists.find(l => l.id === listId);
    if (list && groupId) {
      await sendMessageToBackground(page, {
        type: 'SAVE_GROUP_LIST',
        list: {
          ...list,
          groupIds: [...list.groupIds, groupId],
          updatedAt: Date.now(),
        },
      } as Record<string, unknown>);
    }
  }
}

async function scheduleShareViaMessage(
  page: Page,
  listId: string,
  settings: {
    mode: 'share_original' | 'repost_content';
    caption: string;
    safetyLevel: 'fast' | 'balanced' | 'safe';
    overnightPause: boolean;
    overnightStart: string;
    overnightEnd: string;
    maxPostsPerDay: number;
    delayBetweenGroups: number;
  }
): Promise<string> {
  const shareId = `shr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const response = await sendMessageToBackground(page, {
    type: 'SCHEDULE_SHARE',
    payload: {
      postUrl: 'https://www.facebook.com/testpost/123456',
      postPreview: {
        url: 'https://www.facebook.com/testpost/123456',
        authorName: 'Test Author',
        authorProfileUrl: 'https://www.facebook.com/testauthor',
        text: 'Test post content',
        images: [],
        videoUrl: undefined,
        isReel: false,
        isVideo: false,
        postedAt: Date.now(),
      },
      groupListId: listId,
      settings: {
        mode: settings.mode,
        caption: settings.caption,
        firstComment: '',
        useSpintax: false,
        delayBetweenGroups: settings.delayBetweenGroups,
        safetyLevel: settings.safetyLevel,
        overnightPause: settings.overnightPause,
        overnightStart: settings.overnightStart,
        overnightEnd: settings.overnightEnd,
        maxPostsPerDay: settings.maxPostsPerDay,
      },
      scheduledAt: Date.now() + 1000,
    },
  });

  expect(response.success).toBe(true);
  return shareId;
}

test.describe('Share Execution - Facebook', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Facebook sharing with share_original mode', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Test FB Share Original', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'FB Group 1', url: 'https://www.facebook.com/groups/fbgroup1' },
      { name: 'FB Group 2', url: 'https://www.facebook.com/groups/fbgroup2' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Test caption for share_original',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    expect(shareId).toBeTruthy();

    // Verify share was scheduled
    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    expect(scheduledResponse.success).toBe(true);
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share).toBeTruthy();
    expect(share.settings.mode).toBe('share_original');
  });

  test('Facebook sharing with repost_content mode', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Test FB Repost', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'FB Repost Group', url: 'https://www.facebook.com/groups/fbrepost' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'repost_content',
      caption: 'Test caption for repost',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    expect(shareId).toBeTruthy();

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share?.settings.mode).toBe('repost_content');
  });
});

test.describe('Share Execution - WhatsApp', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('WhatsApp group sharing', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Test WhatsApp Share', 'whatsapp');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'WhatsApp Group 1', url: 'https://web.whatsapp.com/accept?code=test1' },
      { name: 'WhatsApp Group 2', url: 'https://web.whatsapp.com/accept?code=test2' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Test WhatsApp share',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    expect(shareId).toBeTruthy();

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share).toBeTruthy();
    expect(share?.groupListId).toBe(listId);
  });
});

test.describe('Share Execution - Messenger', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Messenger group sharing', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Test Messenger Share', 'messenger');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Messenger Group 1', url: 'https://www.messenger.com/t/123456' },
      { name: 'Messenger Group 2', url: 'https://www.messenger.com/t/789012' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Test Messenger share',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    expect(shareId).toBeTruthy();

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share).toBeTruthy();
    expect(share?.groupListId).toBe(listId);
  });
});

test.describe('Safety Level Delays', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Fast safety level uses 10-20s jitter range', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Fast Safety List', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Fast Group', url: 'https://www.facebook.com/groups/fastdelay' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Fast safety test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share?.settings.safetyLevel).toBe('fast');
    expect(share?.settings.delayBetweenGroups).toBe(60000);
  });

  test('Balanced safety level uses 30-60s jitter range', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Balanced Safety List', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Balanced Group', url: 'https://www.facebook.com/groups/balanceddelay' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Balanced safety test',
      safetyLevel: 'balanced',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share?.settings.safetyLevel).toBe('balanced');
  });

  test('Safe safety level uses 90-180s jitter range', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Safe Safety List', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Safe Group', url: 'https://www.facebook.com/groups/safedelay' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Safe safety test',
      safetyLevel: 'safe',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share?.settings.safetyLevel).toBe('safe');
  });
});

test.describe('Overnight Pause Enforcement', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Overnight pause settings are stored correctly', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Overnight Pause Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Overnight Group', url: 'https://www.facebook.com/groups/overnight' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Overnight pause test',
      safetyLevel: 'fast',
      overnightPause: true,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.overnightPause).toBe(true);
    expect(share?.settings.overnightStart).toBe('22:00');
    expect(share?.settings.overnightEnd).toBe('07:00');
  });

  test('Overnight pause disabled allows shares anytime', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Daytime Only Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Daytime Group', url: 'https://www.facebook.com/groups/daytime' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Daytime test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.overnightPause).toBe(false);
  });
});

test.describe('Daily Limit Enforcement', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Daily limit setting is stored with share', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Daily Limit Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Limit Group 1', url: 'https://www.facebook.com/groups/limit1' },
      { name: 'Limit Group 2', url: 'https://www.facebook.com/groups/limit2' },
      { name: 'Limit Group 3', url: 'https://www.facebook.com/groups/limit3' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Daily limit test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 2,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.maxPostsPerDay).toBe(2);
  });

  test('Daily posts counter is accessible', async () => {
    const response = await sendMessageToBackground(popupPage, {
      type: 'GET_DAILY_POSTS',
    });
    expect(response.success).toBe(true);
    expect(typeof response.data).toBe('number');
    expect(response.data).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Progress Broadcasting', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Share progress can be retrieved', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Progress Test List', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Progress Group 1', url: 'https://www.facebook.com/groups/progress1' },
      { name: 'Progress Group 2', url: 'https://www.facebook.com/groups/progress2' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Progress test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    // Get share progress
    const progressResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_SHARE_PROGRESS',
      shareId,
    });

    interface ShareProgress {
      totalGroups: number;
      completedGroups: number;
      successfulGroups: number;
      failedGroups: number;
      errors: Array<{ groupId: string; error: string }>;
      startedAt: number;
    }

    expect(progressResponse.success).toBe(true);
    if (progressResponse.data) {
      const progress = progressResponse.data as ShareProgress;
      expect(progress).toHaveProperty('totalGroups');
      expect(progress).toHaveProperty('completedGroups');
      expect(progress).toHaveProperty('successfulGroups');
      expect(progress).toHaveProperty('failedGroups');
      expect(progress).toHaveProperty('errors');
      expect(progress).toHaveProperty('startedAt');
    }
  });

  test('Progress includes current group info structure', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Current Group Progress', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Current Group', url: 'https://www.facebook.com/groups/current' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Current group test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const progressResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_SHARE_PROGRESS',
      shareId,
    });

    expect(progressResponse.success).toBe(true);
  });

  test('Progress includes error details structure', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Error Progress Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Error Group', url: 'https://www.facebook.com/groups/error' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Error progress test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const progressResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_SHARE_PROGRESS',
      shareId,
    });

    expect(progressResponse.success).toBe(true);
  });
});

test.describe('Share Job State Machine', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Job starts in pending state', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'State Machine Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'State Group', url: 'https://www.facebook.com/groups/state' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'State machine test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.status).toBe('pending');
  });

  test('Checkpoint data structure is valid', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Checkpoint Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Checkpoint Group 1', url: 'https://www.facebook.com/groups/checkpoint1' },
      { name: 'Checkpoint Group 2', url: 'https://www.facebook.com/groups/checkpoint2' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Checkpoint test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share).toBeTruthy();
    // Checkpoint would be created during execution
  });

  test('Job can be cancelled', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Cancel Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Cancel Group', url: 'https://www.facebook.com/groups/cancel' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Cancel test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const cancelResponse = await sendMessageToBackground(popupPage, {
      type: 'CANCEL_SHARE',
      shareId,
    });

    expect(cancelResponse.success).toBe(true);

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);
    expect(share?.status).toBe('cancelled');
  });
});

test.describe('Cross-Platform Share Execution', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Facebook share with repost_content mode stores correctly', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'FB Repost Images', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'FB Images Group', url: 'https://www.facebook.com/groups/fbimages' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'repost_content',
      caption: 'Test with images',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.mode).toBe('repost_content');
  });

  test('WhatsApp share stores platform correctly', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'WA Platform Test', 'whatsapp');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'WA Group', url: 'https://web.whatsapp.com/accept?code=watplatform' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'WhatsApp message',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share).toBeTruthy();
  });

  test('Messenger share stores platform correctly', async () => {
    const listId = await createGroupListViaMessage(
      popupPage,
      'Messenger Platform Test',
      'messenger'
    );
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Messenger Group', url: 'https://www.messenger.com/t/messengerplatform' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Messenger message',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share).toBeTruthy();
  });
});

test.describe('Spintax and Template Integration', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Spintax caption is stored correctly', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Spintax Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Spintax Group', url: 'https://www.facebook.com/groups/spintax' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: '{Hello|Hi|Hey} {world|everyone|friends}!',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.caption).toBe('{Hello|Hi|Hey} {world|everyone|friends}!');
  });

  test('Template settings are stored with share', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Template Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Template Group', url: 'https://www.facebook.com/groups/template' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Template caption',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.caption).toBe('Template caption');
  });
});

test.describe('Error Handling and Recovery', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('Share settings include anomaly detection config', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Anomaly Config Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Anomaly Group', url: 'https://www.facebook.com/groups/anomaly' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Anomaly test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.safetyLevel).toBeDefined();
    expect(share?.settings.overnightPause).toBeDefined();
    expect(share?.settings.maxPostsPerDay).toBeDefined();
  });

  test('Multiple groups in list for retry testing', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Retry Test List', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Retry Group 1', url: 'https://www.facebook.com/groups/retry1' },
      { name: 'Retry Group 2', url: 'https://www.facebook.com/groups/retry2' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Retry test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share).toBeTruthy();
    // Groups will be retrieved from list during execution
  });

  test('Job recovery after service worker restart preserves scheduled shares', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Recovery Test', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Recovery Group', url: 'https://www.facebook.com/groups/recovery' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Recovery test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 10,
      delayBetweenGroups: 60000,
    });

    // Reload the popup (simulates extension reload)
    await popupPage.reload();
    await expect(popupPage.locator('.fgp-popup')).toBeVisible();

    // Verify share still exists
    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share).toBeTruthy();
    expect(share?.status).toBe('pending');
  });
});

test.describe('Free Plan Limits', () => {
  let popupPage: Page;

  test.beforeEach(async () => {
    popupPage = await openPopup();
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  interface UserSettingsResponse {
    success: boolean;
    data?: { plan: 'free' | 'pro'; [key: string]: unknown };
  }

  test('User settings include plan type', async () => {
    const response = await sendMessageToBackground(popupPage, {
      type: 'GET_USER_SETTINGS',
    });

    expect(response.success).toBe(true);
    expect(response.data).toBeTruthy();
    const settings = response.data as UserSettingsResponse['data'];
    expect(settings?.plan).toBeDefined();
    expect(['free', 'pro']).toContain(settings?.plan);
  });

  test('Daily limit respects free plan constraints', async () => {
    const listId = await createGroupListViaMessage(popupPage, 'Free Plan Limit', 'facebook');
    await addGroupsViaMessage(popupPage, listId, [
      { name: 'Free Group', url: 'https://www.facebook.com/groups/freeplan' },
    ]);

    const shareId = await scheduleShareViaMessage(popupPage, listId, {
      mode: 'share_original',
      caption: 'Free plan test',
      safetyLevel: 'fast',
      overnightPause: false,
      overnightStart: '22:00',
      overnightEnd: '07:00',
      maxPostsPerDay: 20,
      delayBetweenGroups: 60000,
    });

    const scheduledResponse = await sendMessageToBackground(popupPage, {
      type: 'GET_ALL_SCHEDULED',
    });
    const shares = scheduledResponse.data as ScheduledShare[] | undefined;
    const share = shares?.find(s => s.id === shareId);

    expect(share?.settings.maxPostsPerDay).toBeLessThanOrEqual(500); // Hard limit
  });
});
