import { logger } from '../shared/logger';
import type {
  ScheduledShare,
  ShareSettings,
  ShareProgress,
  PostPreview,
  ShareResult,
  Group,
  GroupList,
  Template,
  ImageSet,
} from '../shared/types';
import {
  get,
  set,
  del,
  getAll,
  getUserSettings,
  exportAllData,
  importAllData,
  clearNamespace,
} from '../shared/storage';
import {
  DEFAULT_SHARE_SETTINGS,
  DEFAULT_USER_SETTINGS,
  SAFETY_LEVEL_DELAYS,
} from '../shared/types';
import {
  sanitizeSettings,
  sanitizeGroupList,
  sanitizeTemplate,
  sanitizeImageSet,
  validateShareId,
  validateGroupListId,
  validateTemplateId,
  validateImageSetId,
  generateSecureId,
  sanitizeGroupName,
  sanitizeUrl,
  validateFacebookUrl,
} from '../shared/security';

const ALARM_NAME = 'fgp-scheduler';

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

logger.info('background', 'Service worker started');

chrome.runtime.onInstalled.addListener(async details => {
  logger.info('background', 'Installed', { reason: details.reason });
  if (details.reason === 'install') {
    await initializeDefaults();
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
  await setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info('background', 'Browser startup');
  await setupAlarms();
  await processScheduledShares();
});

async function initializeDefaults(): Promise<void> {
  const settings = await getUserSettings();
  if (!settings) {
    await set('userSettings', DEFAULT_USER_SETTINGS);
  }
  await set('dailyPosts', 0);
  await set('dailyPostsDate', getLocalDateKey());
}

async function setupAlarms(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === ALARM_NAME) {
    await processScheduledShares();
    await resetDailyCounterIfNeeded();
  }
});

async function resetDailyCounterIfNeeded(): Promise<void> {
  const today = getLocalDateKey();
  const storedDate = await get<string>('dailyPostsDate');
  if (storedDate !== today) {
    await set('dailyPosts', 0);
    await set('dailyPostsDate', today);
  }
}

async function processScheduledShares(): Promise<void> {
  const now = Date.now();
  const scheduled = await getAll<ScheduledShare>('scheduledShares');
  const pending = Object.values(scheduled).filter(
    s => s.status === 'pending' && s.scheduledAt <= now
  );

  for (const share of pending) {
    await executeShare(share.id);
  }
}

async function executeShare(shareId: string): Promise<void> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (!share || share.status !== 'pending') return;

  await set(
    'scheduledShares',
    { ...share, status: 'running', progress: createInitialProgress(share) },
    shareId
  );

  try {
    const groups = await getGroupsForList(share.groupListId);
    const settings = { ...DEFAULT_SHARE_SETTINGS, ...share.settings };
    const progress = createInitialProgress(share);
    progress.totalGroups = groups.length;
    await updateProgress(shareId, progress);

    let completedGroups = progress.completedGroups;
    let successfulGroups = progress.successfulGroups;
    let failedGroups = progress.failedGroups;
    const errors = [...progress.errors];
    let dailyPosts = (await get<number>('dailyPosts')) || 0;
    const maxPerDay = settings.maxPostsPerDay || DEFAULT_SHARE_SETTINGS.maxPostsPerDay;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;

      if (dailyPosts >= maxPerDay) {
        errors.push({
          groupId: group.id,
          groupName: group.name,
          error: 'Daily post limit reached',
          timestamp: Date.now(),
          retryable: false,
        });
        await updateProgress(shareId, { errors: [...errors] });
        break;
      }

      if (await isOvernightPause(settings)) {
        await waitForOvernightPauseEnd(settings);
      }

      await updateProgress(shareId, { currentGroupId: group.id, currentGroupName: group.name });

      try {
        await shareToGroup(share.postUrl, group, settings, share.postPreview);
        dailyPosts++;
        await set('dailyPosts', dailyPosts);
        completedGroups++;
        successfulGroups++;
        await updateProgress(shareId, {
          completedGroups,
          successfulGroups,
          failedGroups,
          errors: [...errors],
        });
      } catch (error) {
        if (!group) return;
        completedGroups++;
        failedGroups++;
        errors.push({
          groupId: group.id,
          groupName: group.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
          retryable: true,
        });
        await updateProgress(shareId, {
          completedGroups,
          successfulGroups,
          failedGroups,
          errors: [...errors],
        });
      }

      if (i < groups.length - 1) {
        const delay = calculateDelay(settings);
        await sleep(delay);
      }
    }

    const finalStatus = successfulGroups > 0 ? 'completed' : 'failed';
    await set(
      'scheduledShares',
      {
        ...share,
        status: finalStatus,
        progress: {
          ...progress,
          completedGroups,
          successfulGroups,
          failedGroups,
          errors,
        },
        completedAt: Date.now(),
      },
      shareId
    );

    await notifyUser(shareId, finalStatus, successfulGroups);
  } catch {
    await set(
      'scheduledShares',
      {
        ...share,
        status: 'failed',
      },
      shareId
    );
    await notifyUser(shareId, 'failed', 0);
  }
}

function createInitialProgress(share: ScheduledShare): ShareProgress {
  return {
    totalGroups: share.progress?.totalGroups || 0,
    completedGroups: share.progress?.completedGroups || 0,
    successfulGroups: share.progress?.successfulGroups || 0,
    failedGroups: share.progress?.failedGroups || 0,
    currentGroupId: share.progress?.currentGroupId,
    currentGroupName: share.progress?.currentGroupName,
    errors: share.progress?.errors || [],
    startedAt: share.progress?.startedAt || Date.now(),
    estimatedCompletionAt: share.progress?.estimatedCompletionAt,
  };
}

async function updateProgress(shareId: string, updates: Partial<ShareProgress>): Promise<void> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (share && share.progress) {
    const newProgress: ShareProgress = { ...share.progress, ...updates };
    await set(
      'scheduledShares',
      {
        ...share,
        progress: newProgress,
      },
      shareId
    );
    broadcastProgress(shareId, newProgress);
  }
}

function broadcastProgress(shareId: string, progress: ShareProgress): void {
  chrome.runtime.sendMessage({ type: 'SHARE_PROGRESS', shareId, progress });
}

async function getGroupsForList(listId: string): Promise<Array<{ id: string; name: string }>> {
  const list = await get<GroupList>('groupLists', listId);
  if (!list) return [];
  const groups = await getAll<Group>('groups');
  return list.groupIds
    .map(id => groups[id])
    .filter((g): g is Group => !!g)
    .map(g => ({ id: g.id, name: g.name }));
}

async function shareToGroup(
  postUrl: string,
  group: { id: string; name: string },
  settings: ShareSettings,
  preview: PostPreview
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: '*://*.facebook.com/*' }, tabs => {
      const tab = tabs.find(t => t.url?.includes('facebook.com'));
      if (!tab || !tab.id) {
        reject(new Error('No Facebook tab found'));
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: performShare,
          args: [postUrl, group.id, settings, preview],
        },
        results => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const result = results?.[0]?.result;
          if (result?.success) {
            resolve();
          } else {
            reject(new Error(result?.error || 'Share failed'));
          }
        }
      );
    });
  });
}

async function performShare(
  postUrl: string,
  groupId: string,
  settings: ShareSettings,
  _preview: PostPreview
): Promise<{ success: boolean; error?: string }> {
  try {
    const shareButton = document.querySelector('[data-testid="share-button"]') as HTMLElement;
    if (!shareButton) {
      return { success: false, error: 'Share button not found' };
    }

    shareButton.click();

    await new Promise(r => setTimeout(r, 1000));

    const shareDialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(
      el => el.textContent?.includes('Share') || el.textContent?.includes('share')
    ) as HTMLElement;
    if (!shareDialog) {
      return { success: false, error: 'Share dialog not opened' };
    }

    const groupInput = shareDialog.querySelector(
      'input[placeholder*="group" i], input[aria-label*="group" i]'
    ) as HTMLInputElement;
    if (groupInput) {
      groupInput.value = groupId;
      groupInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    if (settings.caption) {
      const captionInput = shareDialog.querySelector(
        'textarea[placeholder*="say" i], [contenteditable="true"]'
      ) as HTMLElement;
      if (captionInput) {
        captionInput.textContent = settings.caption;
        captionInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const postButton = Array.from(shareDialog.querySelectorAll('[role="button"]')).find(
      el => el.textContent?.includes('Post') || el.textContent?.includes('Share')
    ) as HTMLElement;
    if (postButton) {
      postButton.click();
      await new Promise(r => setTimeout(r, 1000));
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function calculateDelay(settings: ShareSettings): number {
  const baseDelay = settings.delayBetweenGroups || DEFAULT_SHARE_SETTINGS.delayBetweenGroups;
  const range = SAFETY_LEVEL_DELAYS[settings.safetyLevel || 'balanced'];
  const jitter = Math.random() * (range.max - range.min) + range.min;
  return baseDelay + jitter;
}

async function isOvernightPause(settings: ShareSettings): Promise<boolean> {
  if (!settings.overnightPause || !settings.overnightStart || !settings.overnightEnd) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeStr(settings.overnightStart);
  const endMinutes = parseTimeStr(settings.overnightEnd);
  if (startMinutes === null || endMinutes === null) return false;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight span (e.g., 22:00-07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function parseTimeStr(timeStr: string): number | null {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

async function waitForOvernightPauseEnd(settings: ShareSettings): Promise<void> {
  if (!settings.overnightEnd) return;
  const endMinutes = parseTimeStr(settings.overnightEnd);
  if (endMinutes === null) return;
  const now = new Date();
  const endHour = Math.floor(endMinutes / 60);
  const endMin = endMinutes % 60;
  const endTime = new Date();
  endTime.setHours(endHour, endMin, 0, 0);
  if (endTime <= now) endTime.setDate(endTime.getDate() + 1);
  const waitMs = endTime.getTime() - now.getTime();
  await sleep(waitMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function notifyUser(
  shareId: string,
  status: 'completed' | 'failed',
  totalGroups: number
): Promise<void> {
  const userSettings = await getUserSettings();
  const title = status === 'completed' ? 'Share Completed' : 'Share Failed';
  const message =
    status === 'completed'
      ? `Successfully shared to ${totalGroups} groups`
      : `Failed to share. Check extension for details.`;

  if (userSettings.desktopNotifications) {
    chrome.notifications.create(`fgp-${shareId}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2,
    });
  }

  if (userSettings.soundNotifications) {
    chrome.runtime.sendMessage({ type: 'PLAY_SOUND', sound: status });
  }
}

const VALID_MESSAGE_TYPES = [
  'SCHEDULE_SHARE',
  'CANCEL_SHARE',
  'GET_SHARE_PROGRESS',
  'GET_DAILY_POSTS',
  'SYNC_GROUPS',
  'SYNC_WHATSAPP_GROUPS',
  'SYNC_MESSENGER_GROUPS',
  'GET_ALL_GROUPS',
  'GET_GROUP_LISTS',
  'GET_GROUPS_FOR_LIST',
  'GET_TEMPLATES',
  'GET_IMAGE_SETS',
  'GET_ALL_SCHEDULED',
  'GET_SHARE_HISTORY',
  'GET_USER_SETTINGS',
  'UPDATE_USER_SETTINGS',
  'SAVE_GROUP_LIST',
  'DELETE_GROUP_LIST',
  'SAVE_TEMPLATE',
  'DELETE_TEMPLATE',
  'SAVE_IMAGE_SET',
  'DELETE_IMAGE_SET',
  'EXPORT_DATA',
  'IMPORT_DATA',
  'CLEAR_ALL_DATA',
  'GET_WHATSAPP_GROUPS',
  'GET_MESSENGER_GROUPS',
  'GET_CURRENT_MESSAGE',
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type || !VALID_MESSAGE_TYPES.includes(message.type)) {
    sendResponse({ success: false, error: 'Invalid or unknown message type' });
    return true;
  }

  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return true;
  }

  switch (message.type) {
    case 'SCHEDULE_SHARE': {
      handleScheduleShare(message.payload).then(sendResponse);
      return true;
    }
    case 'CANCEL_SHARE': {
      if (!validateShareId(message.shareId)) {
        sendResponse({ success: false, error: 'Invalid share ID' });
        return true;
      }
      handleCancelShare(message.shareId).then(sendResponse);
      return true;
    }
    case 'GET_SHARE_PROGRESS': {
      if (!validateShareId(message.shareId)) {
        sendResponse({ success: false, error: 'Invalid share ID' });
        return true;
      }
      get<ScheduledShare>('scheduledShares', message.shareId).then(sendResponse);
      return true;
    }
    case 'GET_DAILY_POSTS': {
      get<number>('dailyPosts').then(sendResponse);
      return true;
    }
    case 'SYNC_GROUPS': {
      handleSyncGroups(sender.tab?.id).then(sendResponse);
      return true;
    }
    case 'GET_ALL_GROUPS': {
      getAll<Group>('groups').then(sendResponse);
      return true;
    }
    case 'GET_GROUP_LISTS': {
      getAll<GroupList>('groupLists').then(sendResponse);
      return true;
    }
    case 'GET_GROUPS_FOR_LIST': {
      get<GroupList>('groupLists', message.listId).then(list => {
        if (!list) return sendResponse([]);
        getAll<Group>('groups').then(groups => {
          const result = list.groupIds.map(id => groups[id]).filter(Boolean);
          sendResponse(result);
        });
      });
      return true;
    }
    case 'GET_TEMPLATES': {
      getAll<Template>('templates').then(sendResponse);
      return true;
    }
    case 'GET_IMAGE_SETS': {
      getAll<ImageSet>('imageSets').then(sendResponse);
      return true;
    }
    case 'GET_ALL_SCHEDULED': {
      getAll<ScheduledShare>('scheduledShares').then(sendResponse);
      return true;
    }
    case 'GET_SHARE_HISTORY': {
      getAll<ShareResult>('shareHistory').then(sendResponse);
      return true;
    }
    case 'GET_USER_SETTINGS': {
      getUserSettings().then(sendResponse);
      return true;
    }
    case 'UPDATE_USER_SETTINGS': {
      getUserSettings()
        .then(current => {
          const sanitized = sanitizeSettings(message.settings);
          set('userSettings', { ...current, ...sanitized });
        })
        .then(() => sendResponse({ success: true }));
      return true;
    }
    case 'SAVE_GROUP_LIST': {
      if (!message.list || !validateGroupListId(message.list.id)) {
        sendResponse({ success: false, error: 'Invalid group list' });
        return true;
      }
      const sanitized = sanitizeGroupList(message.list);
      set('groupLists', sanitized, sanitized.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'DELETE_GROUP_LIST': {
      if (!validateGroupListId(message.id)) {
        sendResponse({ success: false, error: 'Invalid group list ID' });
        return true;
      }
      del('groupLists', message.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'SAVE_TEMPLATE': {
      if (!message.template || !validateTemplateId(message.template.id)) {
        sendResponse({ success: false, error: 'Invalid template' });
        return true;
      }
      const sanitized = sanitizeTemplate(message.template);
      set('templates', sanitized, sanitized.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'DELETE_TEMPLATE': {
      if (!validateTemplateId(message.id)) {
        sendResponse({ success: false, error: 'Invalid template ID' });
        return true;
      }
      del('templates', message.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'SAVE_IMAGE_SET': {
      if (!message.imageSet || !validateImageSetId(message.imageSet.id)) {
        sendResponse({ success: false, error: 'Invalid image set' });
        return true;
      }
      const sanitized = sanitizeImageSet(message.imageSet);
      set('imageSets', sanitized, sanitized.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'DELETE_IMAGE_SET': {
      if (!validateImageSetId(message.id)) {
        sendResponse({ success: false, error: 'Invalid image set ID' });
        return true;
      }
      del('imageSets', message.id).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'EXPORT_DATA': {
      exportAllData().then(sendResponse);
      return true;
    }
    case 'IMPORT_DATA': {
      if (!message.data || typeof message.data !== 'string') {
        sendResponse({ success: false, error: 'Invalid import data' });
        return true;
      }
      try {
        JSON.parse(message.data);
      } catch {
        sendResponse({ success: false, error: 'Invalid JSON data' });
        return true;
      }

      importAllData(message.data)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, error: 'Invalid backup data' }));
      return true;
    }
    case 'CLEAR_ALL_DATA': {
      clearAllData().then(() => sendResponse({ success: true }));
      return true;
    }
    case 'GET_WHATSAPP_GROUPS': {
      getAll<Group>('groups').then(groups => {
        const waGroups = Object.values(groups).filter(g => g.platform === 'whatsapp');
        sendResponse(waGroups.map(g => ({ id: g.id, name: g.name })));
      });
      return true;
    }
    case 'GET_MESSENGER_GROUPS': {
      getAll<Group>('groups').then(groups => {
        const msGroups = Object.values(groups).filter(g => g.platform === 'messenger');
        sendResponse(msGroups.map(g => ({ id: g.id, name: g.name })));
      });
      return true;
    }
    case 'GET_CURRENT_MESSAGE': {
      getCurrentMessage(sender.tab?.id).then(sendResponse);
      return true;
    }
    case 'SYNC_WHATSAPP_GROUPS': {
      handleSyncWhatsAppGroups(sender.tab?.id).then(sendResponse);
      return true;
    }
    case 'SYNC_MESSENGER_GROUPS': {
      handleSyncMessengerGroups(sender.tab?.id).then(sendResponse);
      return true;
    }
  }
});

async function clearAllData(): Promise<void> {
  const namespaces = [
    'groups',
    'groupLists',
    'scheduledShares',
    'shareHistory',
    'imageSets',
    'templates',
    'userSettings',
  ];
  for (const ns of namespaces) {
    await clearNamespace(ns);
  }
  // Re-initialize defaults
  await set('userSettings', DEFAULT_USER_SETTINGS);
  await set('dailyPosts', 0);
  await set('dailyPostsDate', getLocalDateKey());
}

async function handleScheduleShare(payload: {
  postUrl: string;
  postPreview: PostPreview;
  groupListId: string;
  settings: ShareSettings;
  scheduledAt: number;
}): Promise<{ success: boolean; shareId?: string; error?: string }> {
  if (
    !payload ||
    typeof payload.postUrl !== 'string' ||
    !validateFacebookUrl(payload.postUrl) ||
    typeof payload.groupListId !== 'string' ||
    !validateGroupListId(payload.groupListId) ||
    !Number.isFinite(payload.scheduledAt) ||
    !payload.postPreview ||
    typeof payload.postPreview !== 'object'
  ) {
    return { success: false, error: 'Invalid scheduled share details' };
  }

  const groupList = await get<GroupList>('groupLists', payload.groupListId);
  if (!groupList) return { success: false, error: 'Group list not found' };

  const settings = { ...DEFAULT_SHARE_SETTINGS, ...sanitizeSettings(payload.settings) };
  const postUrl = sanitizeUrl(payload.postUrl);
  if (!postUrl) return { success: false, error: 'Only valid HTTPS Facebook post URLs are supported' };

  const shareId = generateSecureId('share');
  const share: ScheduledShare = {
    id: shareId,
    postUrl,
    postPreview: payload.postPreview,
    groupListId: payload.groupListId,
    settings,
    scheduledAt: payload.scheduledAt,
    createdAt: Date.now(),
    status: 'pending',
  };
  await set('scheduledShares', share, shareId);
  return { success: true, shareId };
}

async function handleCancelShare(shareId: string): Promise<{ success: boolean }> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (share && share.status === 'pending') {
    await set('scheduledShares', { ...share, status: 'cancelled' }, shareId);
    return { success: true };
  }
  return { success: false };
}

async function handleSyncGroups(tabId?: number): Promise<{
  success: boolean;
  groups?: Array<{ id: string; name: string; url: string; memberCount?: number }>;
  error?: string;
}> {
  if (!tabId) {
    const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
    if (tabs[0]?.id) tabId = tabs[0].id;
  }
  if (!tabId) {
    return { success: false, error: 'No Facebook tab open. Open a Facebook page and try again.' };
  }

  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: extractGroupsFromPage,
      },
      results => {
        if (chrome.runtime.lastError) {
          logger.error('background', 'Script injection failed', {
            error: chrome.runtime.lastError.message,
          });
          resolve({
            success: false,
            error: `Script injection failed: ${chrome.runtime.lastError.message}. Make sure you're on a Facebook page (not chrome:// or extension pages).`,
          });
          return;
        }
        if (!results?.[0]?.result) {
          logger.warn('background', 'No groups extracted - empty result');
          resolve({
            success: false,
            error:
              'No groups found on this page. Navigate to your Facebook Groups page (facebook.com/groups/feed/) and try again.',
          });
          return;
        }
        const groups = results[0].result;
        logger.info('background', 'Groups extracted', { count: groups.length });
        if (groups.length === 0) {
          resolve({
            success: false,
            error:
              'No groups found. Make sure you are on facebook.com/groups/feed/ or a page showing your groups.',
          });
          return;
        }
        resolve({ success: true, groups });
      }
    );
  });
}

function extractGroupsFromPage(): Array<{
  id: string;
  name: string;
  url: string;
  memberCount?: number;
}> {
  const groups: Array<{ id: string; name: string; url: string; memberCount?: number }> = [];

  // Multiple selector strategies for Facebook Groups page
  const groupItemSelectors = [
    '[role="listitem"]',
    '[data-testid="group-card"]',
    '[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]',
    '.x1yztbdb',
    '.x1n2onr6',
    '.x78zum5',
    '.x1q0g3np',
    '.x1iyjqo2',
    'div[role="article"]',
  ];

  const nameSelectors = [
    '[role="heading"]',
    'strong',
    '.x1lliihq',
    '[dir="auto"]',
    '[data-testid="group-name"]',
    'h3',
    'h4',
  ];

  const linkSelectors = ['a[href*="/groups/"]', 'a[href*="facebook.com/groups/"]'];

  for (const itemSel of groupItemSelectors) {
    const items = document.querySelectorAll(itemSel);
    for (const el of items) {
      // Find group link
      let link: HTMLAnchorElement | null = null;
      for (const linkSel of linkSelectors) {
        link = el.querySelector(linkSel) as HTMLAnchorElement;
        if (link) break;
      }

      if (!link) continue;

      // Find group name
      let name = '';
      for (const nameSel of nameSelectors) {
        const nameEl = el.querySelector(nameSel) as HTMLElement;
        if (nameEl?.textContent?.trim()) {
          name = nameEl.textContent.trim();
          break;
        }
      }

      const url = link.href;
      const idMatch = url.match(/groups\/(\d+)/) || url.match(/groups\/([^\/?]+)/);
      const id = idMatch?.[1] || url;

      if (name && name.length > 1) {
        // Try to extract member count
        let memberCount: number | undefined;
        const memberText = el.textContent || '';
        const memberMatch = memberText.match(/(\d[\d,]*)\s*(members?|people)/i);
        if (memberMatch) {
          memberCount = parseInt(memberMatch[1].replace(/,/g, ''), 10);
        }

        if (!groups.some(g => g.id === id)) {
          groups.push({ id, name, url, memberCount });
        }
      }
    }
    if (groups.length > 0) break;
  }

  return groups;
}

async function handleSyncWhatsAppGroups(tabId?: number): Promise<{
  success: boolean;
  groups?: Array<{ id: string; name: string; url?: string }>;
  error?: string;
}> {
  if (!tabId) {
    const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    if (tabs[0]?.id) tabId = tabs[0].id;
  }
  if (!tabId) {
    return {
      success: false,
      error: 'No WhatsApp Web tab open. Open web.whatsapp.com and try again.',
    };
  }

  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: extractWhatsAppGroupsFromPage,
      },
      results => {
        if (chrome.runtime.lastError) {
          logger.error('background', 'WhatsApp script injection failed', {
            error: chrome.runtime.lastError.message,
          });
          resolve({
            success: false,
            error: `Script injection failed: ${chrome.runtime.lastError.message}. Make sure you're on web.whatsapp.com.`,
          });
          return;
        }
        if (!results?.[0]?.result) {
          logger.warn('background', 'No WhatsApp groups extracted');
          resolve({
            success: false,
            error:
              'No groups found. Open WhatsApp Web, go to your Chats/Groups list, and try again.',
          });
          return;
        }
        const groups = results[0].result;
        logger.info('background', 'WhatsApp groups extracted', { count: groups.length });
        if (groups.length === 0) {
          resolve({
            success: false,
            error:
              'No WhatsApp groups found. Make sure you are on the Chats tab showing your conversations.',
          });
          return;
        }
        saveGroups(groups, 'whatsapp').then(() => {
          resolve({ success: true, groups });
        });
      }
    );
  });
}

async function handleSyncMessengerGroups(tabId?: number): Promise<{
  success: boolean;
  groups?: Array<{ id: string; name: string; url?: string }>;
  error?: string;
}> {
  if (!tabId) {
    const tabs = await chrome.tabs.query({
      url: ['*://www.messenger.com/*', '*://messenger.com/*'],
    });
    if (tabs[0]?.id) tabId = tabs[0].id;
  }
  if (!tabId) {
    return { success: false, error: 'No Messenger tab open. Open messenger.com and try again.' };
  }

  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: extractMessengerGroupsFromPage,
      },
      results => {
        if (chrome.runtime.lastError) {
          logger.error('background', 'Messenger script injection failed', {
            error: chrome.runtime.lastError.message,
          });
          resolve({
            success: false,
            error: `Script injection failed: ${chrome.runtime.lastError.message}. Make sure you're on messenger.com.`,
          });
          return;
        }
        if (!results?.[0]?.result) {
          logger.warn('background', 'No Messenger groups extracted');
          resolve({
            success: false,
            error: 'No groups found. Open Messenger, go to your conversations list, and try again.',
          });
          return;
        }
        const groups = results[0].result;
        logger.info('background', 'Messenger groups extracted', { count: groups.length });
        if (groups.length === 0) {
          resolve({
            success: false,
            error: 'No Messenger groups found. Make sure you are on the conversations list page.',
          });
          return;
        }
        saveGroups(groups, 'messenger').then(() => {
          resolve({ success: true, groups });
        });
      }
    );
  });
}

async function saveGroups(
  groups: Array<{ id: string; name: string; url?: string }>,
  platform: 'whatsapp' | 'messenger'
): Promise<void> {
  const now = Date.now();
  for (const group of groups) {
    const groupData = {
      id: group.id,
      name: group.name,
      url: group.url || '',
      platform,
      addedAt: now,
    };
    await set('groups', groupData, group.id);
  }
}

function extractWhatsAppGroupsFromPage(): Array<{ id: string; name: string; url?: string }> {
  const groups: Array<{ id: string; name: string; url?: string }> = [];

  // Multiple selector strategies for WhatsApp Web chat list (auto-generated classes change frequently)
  const chatSelectors = [
    '[role="listitem"]',
    '[data-testid="chat-list-item"]',
    '[data-testid="cell-frame-container"]',
    '[data-testid="conversation-list-item"]',
    'div[role="row"]',
    '._ak8l',
    '._ak8o',
    '._ak8q',
    '._ak8s',
    '.x1yztbdb',
    '.x1n2onr6',
    '[aria-label*="Chat"]',
    '#pane-side [role="listitem"]',
    '#pane-side div[role="row"]',
  ];

  const nameSelectors = [
    '[dir="auto"]',
    '[data-testid="cell-frame-title"]',
    '[data-testid="contact-name"]',
    '[data-testid="conversation-title"]',
    '._ao3e',
    '.x1iyjqo2',
    'span[title]',
    'span[dir="auto"]',
    'div[dir="auto"]',
    'span[aria-label]',
  ];

  // Debug: log all selector matches
  console.log('[FGP] WhatsApp: Starting group extraction');
  for (const chatSel of chatSelectors) {
    const chatItems = document.querySelectorAll(chatSel);
    if (chatItems.length > 0) {
      console.log(`[FGP] WhatsApp: Selector "${chatSel}" matched ${chatItems.length} elements`);
    }
  }

  for (const chatSel of chatSelectors) {
    const chatItems = document.querySelectorAll(chatSel);
    for (const el of chatItems) {
      let name = '';
      for (const nameSel of nameSelectors) {
        const nameEl = el.querySelector(nameSel) as HTMLElement;
        if (nameEl?.textContent?.trim()) {
          name = nameEl.textContent.trim();
          break;
        }
      }
      // Fallback: try to get any text content from the element
      if (!name && el.textContent?.trim()) {
        const text = el.textContent.trim();
        // Filter out very long text (likely not a name) and system messages
        if (text.length > 1 && text.length < 100 && !text.includes('\n')) {
          name = text;
        }
      }

      if (name && name.length > 1) {
        const id = 'wa_' + name.replace(/\s+/g, '_').toLowerCase();
        // Check if already added
        if (!groups.some(g => g.id === id)) {
          groups.push({ id, name });
        }
      }
    }
    // If we found groups with this selector, stop trying others
    if (groups.length > 0) break;
  }

  console.log(`[FGP] WhatsApp: Found ${groups.length} groups`, groups);
  return groups;
}

function extractMessengerGroupsFromPage(): Array<{ id: string; name: string; url?: string }> {
  const groups: Array<{ id: string; name: string; url?: string }> = [];

  // Multiple selector strategies for Messenger chat list
  const chatSelectors = [
    '[role="listitem"]',
    '[data-testid="thread-list-item"]',
    '[data-testid="cell-frame-container"]',
    '[data-testid="conversation-list-item"]',
    'div[role="row"]',
    '.x1yztbdb',
    '.x1n2onr6',
    '.x78zum5',
    '.x1q0g3np',
    '[aria-label*="Conversation"]',
    '[data-pagelet*="Messenger"] [role="listitem"]',
  ];

  const nameSelectors = [
    '[role="heading"]',
    '[data-testid="thread-name"]',
    '[data-testid="cell-frame-title"]',
    '[data-testid="conversation-name"]',
    'strong',
    '.x1lliihq',
    '[dir="auto"]',
    'span[dir="auto"]',
    'div[dir="auto"]',
    'span[aria-label]',
  ];

  // Debug: log all selector matches
  console.log('[FGP] Messenger: Starting group extraction');
  for (const chatSel of chatSelectors) {
    const chatItems = document.querySelectorAll(chatSel);
    if (chatItems.length > 0) {
      console.log(`[FGP] Messenger: Selector "${chatSel}" matched ${chatItems.length} elements`);
    }
  }

  for (const chatSel of chatSelectors) {
    const chatItems = document.querySelectorAll(chatSel);
    for (const el of chatItems) {
      let name = '';
      for (const nameSel of nameSelectors) {
        const nameEl = el.querySelector(nameSel) as HTMLElement;
        if (nameEl?.textContent?.trim()) {
          name = nameEl.textContent.trim();
          break;
        }
      }
      // Fallback: try to get any text content from the element
      if (!name && el.textContent?.trim()) {
        const text = el.textContent.trim();
        if (text.length > 1 && text.length < 100 && !text.includes('\n')) {
          name = text;
        }
      }

      if (name && name.length > 1) {
        const id = 'ms_' + name.replace(/\s+/g, '_').toLowerCase();
        if (!groups.some(g => g.id === id)) {
          groups.push({ id, name });
        }
      }
    }
    if (groups.length > 0) break;
  }

  console.log(`[FGP] Messenger: Found ${groups.length} groups`, groups);
  return groups;
}

async function getCurrentMessage(
  tabId?: number
): Promise<{ text?: string; media?: boolean } | null> {
  if (!tabId) return null;

  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: extractCurrentMessage,
      },
      results => {
        resolve(results?.[0]?.result || null);
      }
    );
  });
}

function extractCurrentMessage(): { text?: string; media?: boolean } | null {
  const selected = window.getSelection();
  if (selected && selected.toString().trim()) {
    return { text: selected.toString().trim() };
  }
  return null;
}
