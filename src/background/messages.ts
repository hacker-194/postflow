/**
 * Background Message Handlers
 * Centralized message handling with validation and sender verification
 */

import { logger } from '../shared/logger';
import type {
  ScheduledShare,
  ShareSettings,
  Group,
  GroupList,
  Template,
  ImageSet,
  UserSettings,
  ShareResult,
  PostPreview,
  BackgroundMessageType,
  MessageResponse,
} from '../shared/types';
import {
  getAll,
  get,
  set,
  del,
  getUserSettings,
  exportAllData,
  importAllData,
  clearAllData,
} from '../shared/storage';
import {
  sanitizeSettings,
  sanitizeUserSettings,
  sanitizeGroupList,
  sanitizeTemplate,
  sanitizeImageSet,
  sanitizeGroupName,
  sanitizeUrl,
  validateGroupId,
  validateShareId,
  validateGroupListId,
  validateTemplateId,
  validateImageSetId,
  validateFacebookUrl,
  generateSecureId,
} from '../shared/security';
import { scheduleShareJob, cancelShareJob, processScheduledShares } from './scheduler';
import { recoverJobs } from './job-runner';

const VALID_MESSAGE_TYPES: BackgroundMessageType[] = [
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
  'SAVE_GROUP',
  'DELETE_GROUP',
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
  'PERFORM_SHARE',
  'SHARE_PROGRESS',
  'PLAY_SOUND',
];

export function setupMessageHandlers(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Async response
  });
}

async function handleMessage(
  message: { type: BackgroundMessageType; payload?: unknown; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  // Validate message type
  if (!message || !message.type || !VALID_MESSAGE_TYPES.includes(message.type)) {
    sendResponse({ success: false, error: 'Invalid or unknown message type' });
    return;
  }

  // Verify sender
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return;
  }

  logger.debug('background', 'Message received', { type: message.type });

  try {
    switch (message.type) {
      case 'SCHEDULE_SHARE': {
        await handleScheduleShare(message.payload as ScheduleSharePayload, sendResponse);
        break;
      }
      case 'CANCEL_SHARE': {
        await handleCancelShare(message.shareId as string, sendResponse);
        break;
      }
      case 'GET_SHARE_PROGRESS': {
        await handleGetShareProgress(message.shareId as string, sendResponse);
        break;
      }
      case 'GET_DAILY_POSTS': {
        const dailyPosts = await get<number>('dailyPosts');
        sendResponse({ success: true, data: dailyPosts || 0 });
        break;
      }
      case 'SYNC_GROUPS': {
        await handleSyncGroups(sender.tab?.id, sendResponse);
        break;
      }
      case 'GET_ALL_GROUPS': {
        const groups = await getAll<Group>('groups');
        sendResponse({ success: true, data: Object.values(groups) });
        break;
      }
      case 'GET_GROUP_LISTS': {
        const lists = await getAll<GroupList>('groupLists');
        sendResponse({ success: true, data: Object.values(lists) });
        break;
      }
      case 'GET_GROUPS_FOR_LIST': {
        await handleGetGroupsForList(message.listId as string, sendResponse);
        break;
      }
      case 'GET_TEMPLATES': {
        const templates = await getAll<Template>('templates');
        sendResponse({ success: true, data: Object.values(templates) });
        break;
      }
      case 'GET_IMAGE_SETS': {
        const imageSets = await getAll<ImageSet>('imageSets');
        sendResponse({ success: true, data: Object.values(imageSets) });
        break;
      }
      case 'GET_ALL_SCHEDULED': {
        const scheduled = await getAll<ScheduledShare>('scheduledShares');
        sendResponse({ success: true, data: Object.values(scheduled) });
        break;
      }
      case 'GET_SHARE_HISTORY': {
        const history = await getAll<ShareResult>('shareHistory');
        sendResponse({ success: true, data: Object.values(history) });
        break;
      }
      case 'GET_USER_SETTINGS': {
        const settings = await getUserSettings();
        sendResponse({ success: true, data: settings });
        break;
      }
      case 'UPDATE_USER_SETTINGS': {
        await handleUpdateUserSettings(message.settings as Partial<UserSettings>, sendResponse);
        break;
      }
      case 'SAVE_GROUP': {
        await handleSaveGroup(message.group as Group, sendResponse);
        break;
      }
      case 'DELETE_GROUP': {
        await handleDeleteGroup(message.id as string, sendResponse);
        break;
      }
      case 'SAVE_GROUP_LIST': {
        await handleSaveGroupList(message.list as GroupList, sendResponse);
        break;
      }
      case 'DELETE_GROUP_LIST': {
        await handleDeleteGroupList(message.id as string, sendResponse);
        break;
      }
      case 'SAVE_TEMPLATE': {
        await handleSaveTemplate(message.template as Template, sendResponse);
        break;
      }
      case 'DELETE_TEMPLATE': {
        await handleDeleteTemplate(message.id as string, sendResponse);
        break;
      }
      case 'SAVE_IMAGE_SET': {
        await handleSaveImageSet(message.imageSet as ImageSet, sendResponse);
        break;
      }
      case 'DELETE_IMAGE_SET': {
        await handleDeleteImageSet(message.id as string, sendResponse);
        break;
      }
      case 'EXPORT_DATA': {
        const data = await exportAllData();
        sendResponse({ success: true, data });
        break;
      }
      case 'IMPORT_DATA': {
        await handleImportData(message.data as string, sendResponse);
        break;
      }
      case 'CLEAR_ALL_DATA': {
        await clearAllData();
        sendResponse({ success: true });
        break;
      }
      case 'GET_WHATSAPP_GROUPS': {
        const groups = await getAll<Group>('groups');
        const waGroups = Object.values(groups).filter(g => g.platform === 'whatsapp');
        sendResponse({ success: true, data: waGroups.map(g => ({ id: g.id, name: g.name })) });
        break;
      }
      case 'GET_MESSENGER_GROUPS': {
        const groups = await getAll<Group>('groups');
        const msGroups = Object.values(groups).filter(g => g.platform === 'messenger');
        sendResponse({ success: true, data: msGroups.map(g => ({ id: g.id, name: g.name })) });
        break;
      }
      case 'GET_CURRENT_MESSAGE': {
        // Handled by content script
        sendResponse({ success: true, data: null });
        break;
      }
      case 'SYNC_WHATSAPP_GROUPS': {
        await handleSyncWhatsAppGroups(sender.tab?.id, sendResponse);
        break;
      }
      case 'SYNC_MESSENGER_GROUPS': {
        await handleSyncMessengerGroups(sender.tab?.id, sendResponse);
        break;
      }
      case 'PERFORM_SHARE': {
        // Handled by content script
        sendResponse({ success: false, error: 'Not implemented in background' });
        break;
      }
      case 'SHARE_PROGRESS': {
        // Broadcast to popup/options
        sendResponse({ success: true });
        break;
      }
      case 'PLAY_SOUND': {
        // Handled by notification system
        sendResponse({ success: true });
        break;
      }
      default: {
        sendResponse({ success: false, error: 'Unhandled message type' });
      }
    }
  } catch (error) {
    logger.error('background', 'Message handler error', { type: message.type, error });
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Handler error',
    });
  }
}

type ScheduleSharePayload = {
  postUrl: string;
  postPreview: PostPreview;
  groupListId: string;
  groupIds?: string[];
  settings: ShareSettings;
  scheduledAt: number;
};

async function handleScheduleShare(
  payload: ScheduleSharePayload,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  // Validate postUrl
  if (!payload.postUrl || !validateFacebookUrl(payload.postUrl)) {
    sendResponse({ success: false, error: 'Invalid Facebook post URL' });
    return;
  }

  // Sanitize groupListId first, then validate
  const sanitizedGroupListId = sanitizeGroupName(payload.groupListId);
  if (!sanitizedGroupListId || !validateGroupListId(sanitizedGroupListId)) {
    sendResponse({ success: false, error: 'Invalid group list ID format' });
    return;
  }

  // Validate settings enums
  if (
    payload.settings?.safetyLevel &&
    !['fast', 'balanced', 'safe'].includes(payload.settings.safetyLevel as string)
  ) {
    sendResponse({ success: false, error: 'Invalid safetyLevel' });
    return;
  }
  if (
    payload.settings?.mode &&
    !['share_original', 'repost_content'].includes(payload.settings.mode as string)
  ) {
    sendResponse({ success: false, error: 'Invalid mode' });
    return;
  }
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (payload.settings?.overnightStart && !timeRegex.test(payload.settings.overnightStart)) {
    sendResponse({ success: false, error: 'Invalid overnightStart format (HH:MM)' });
    return;
  }
  if (payload.settings?.overnightEnd && !timeRegex.test(payload.settings.overnightEnd)) {
    sendResponse({ success: false, error: 'Invalid overnightEnd format (HH:MM)' });
    return;
  }

  // Validate settings numeric bounds
  const settings = sanitizeSettings(payload.settings);
  if (
    typeof payload.settings?.delayBetweenGroups === 'number' &&
    payload.settings.delayBetweenGroups < 5000
  ) {
    sendResponse({ success: false, error: 'delayBetweenGroups must be at least 5000ms' });
    return;
  }
  if (
    typeof payload.settings?.maxPostsPerDay === 'number' &&
    (payload.settings.maxPostsPerDay < 1 || payload.settings.maxPostsPerDay > 500)
  ) {
    sendResponse({ success: false, error: 'maxPostsPerDay must be between 1 and 500' });
    return;
  }

  const shareId = generateSecureId('share');
  const now = Date.now();

  const share: ScheduledShare = {
    id: shareId,
    postUrl: sanitizeUrl(payload.postUrl) || payload.postUrl,
    postPreview: payload.postPreview,
    groupListId: sanitizedGroupListId,
    groupIds: Array.isArray(payload.groupIds)
      ? payload.groupIds.filter(id => typeof id === 'string' && validateGroupId(id)).slice(0, 500)
      : undefined,
    settings,
    scheduledAt: payload.scheduledAt,
    createdAt: now,
    status: 'pending',
    progress: {
      totalGroups: 0,
      completedGroups: 0,
      successfulGroups: 0,
      failedGroups: 0,
      errors: [],
      startedAt: now,
    },
  };

  await set('scheduledShares', share, shareId);
  await scheduleShareJob(share);

  sendResponse({ success: true, data: shareId });
}

async function handleCancelShare(
  shareId: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!validateShareId(shareId)) {
    sendResponse({ success: false, error: 'Invalid share ID' });
    return;
  }
  const result = await cancelShareJob(shareId);
  sendResponse({ success: true, data: result });
}

async function handleGetShareProgress(
  shareId: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!validateShareId(shareId)) {
    sendResponse({ success: false, error: 'Invalid share ID' });
    return;
  }
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  sendResponse({ success: true, data: share ?? null });
}

type ExtractedGroup = { id: string; name: string; url?: string; memberCount?: number };

/**
 * Run the extractor in every open tab for a platform, scrolling the (virtualised)
 * list between passes, and keep the richest result. Picking a single tab by index was
 * unreliable: the UI opens a fresh tab, so the tab holding the logged-in session could
 * be skipped entirely. Each pass is a separate synchronous inject because Chrome turns
 * a rejected injected promise into `result: null` with no error.
 */
async function collectPagedFromTabs<T extends { id: string }>(
  urlPatterns: string[],
  extractor: () => T[],
  scroller: () => void
): Promise<{ items: T[]; errors: string[] }> {
  const tabs = await chrome.tabs.query({ url: urlPatterns });
  let items: T[] = [];
  const errors: string[] = [];

  if (tabs.length === 0) errors.push('no matching tab is open');

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const tabId = tab.id;
    const found = new Map<string, T>();
    let seen = 0;
    try {
      for (let pass = 0; pass < 40; pass++) {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractor,
        });
        const rows = (injection?.result as T[] | undefined) ?? [];
        seen = Math.max(seen, rows.length);
        let added = 0;
        for (const row of rows) {
          if (found.has(row.id)) continue;
          found.set(row.id, row);
          added++;
        }
        if (added === 0 && pass > 0) break;
        await chrome.scripting.executeScript({ target: { tabId }, func: scroller });
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (found.size > items.length) items = Array.from(found.values());
    } catch (error) {
      // Tabs we cannot script (still loading, closed, restricted) are just skipped,
      // but the reason is surfaced when nothing was found at all.
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.debug('background', 'Group extraction skipped tab', { tabId, error: message });
    }
    if (found.size === 0) errors.push(`saw ${seen} rows`);
  }

  return { items, errors };
}

async function handleSyncGroups(
  _senderTabId: number | undefined,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  const { items, errors } = await collectPagedFromTabs(
    ['*://*.facebook.com/*'],
    extractGroupsFromPage,
    scrollPageToBottom
  );
  // Facebook links one group by vanity slug in one place and numeric id in another, and
  // the two can land in different scroll passes, so the merge has to dedupe by name.
  const seenNames = new Set<string>();
  const groups = items.filter(group => {
    const key = group.name.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
  if (groups.length === 0) {
    sendResponse({
      success: false,
      error: `No groups found. Open facebook.com/groups/feed/ while logged in and try again.${errors[0] ? ` (${errors[0]})` : ''}`,
    });
    return;
  }
  await saveGroups(groups, 'facebook');
  sendResponse({ success: true, groups });
}

// Facebook group links are /groups/<slug>/ (slug or numeric id); cards no longer sit
// inside role=listitem or role=article, so the link itself is the reliable structure:
// the name is the first [dir="auto"] inside it, followed by "Last active ..." text.
function extractGroupsFromPage(): ExtractedGroup[] {
  const RESERVED = ['feed', 'joins', 'discover', 'create', 'your_groups', 'joined', 'invites'];
  const groups: ExtractedGroup[] = [];
  const seenIds = new Set<string>();
  // Facebook links the same group by vanity slug on one surface and numeric id on
  // another, so the name is the only stable key across a page.
  // ponytail: two distinct groups sharing a name collapse into one; delete/rename in
  // Options if that ever matters.
  const seenNames = new Set<string>();

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]'));
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    const match = href
      .split('?')[0]
      .replace(/\/+$/, '')
      .match(/\/groups\/([^/]+)$/);
    if (!match) continue;
    const id = match[1];
    if (RESERVED.includes(id.toLowerCase()) || seenIds.has(id)) continue;

    const firstText = anchor.querySelector('[dir="auto"]')?.textContent || anchor.textContent || '';
    const name = firstText
      .split(/Last active/i)[0]
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length < 2 || seenNames.has(name.toLowerCase())) continue;

    seenIds.add(id);
    seenNames.add(name.toLowerCase());
    groups.push({ id, name, url: anchor.href });
  }

  return groups;
}

function scrollPageToBottom(): void {
  window.scrollTo(0, document.body.scrollHeight);
}

async function handleGetGroupsForList(
  listId: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  const list = await get<GroupList>('groupLists', listId);
  if (!list) return sendResponse({ success: true, data: [] });
  const groups = await getAll<Group>('groups');
  const result = list.groupIds.map(id => groups[id]).filter(Boolean);
  sendResponse({ success: true, data: result });
}

async function handleUpdateUserSettings(
  partial: Partial<UserSettings>,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  const current = await getUserSettings();
  const sanitized = sanitizeUserSettings(partial);
  await set('userSettings', { ...current, ...sanitized });
  sendResponse({ success: true });
}

async function handleSaveGroup(
  group: Group,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!group || !group.name?.trim()) {
    sendResponse({ success: false, error: 'Group name is required' });
    return;
  }
  if (group.url && !group.url.startsWith('http')) {
    sendResponse({ success: false, error: 'Valid URL required' });
    return;
  }
  const sanitized = {
    ...group,
    id: group.id || generateSecureId('group'),
    name: group.name.trim(),
    url: group.url?.trim() || '',
    platform: group.platform || 'facebook',
    addedAt: group.addedAt || Date.now(),
  };
  await set('groups', sanitized, sanitized.id);
  sendResponse({ success: true });
}

async function handleDeleteGroup(
  id: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!id) {
    sendResponse({ success: false, error: 'Group ID required' });
    return;
  }
  await del('groups', id);
  sendResponse({ success: true });
}

async function handleSaveGroupList(
  list: GroupList,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!list || !validateGroupListId(list.id)) {
    sendResponse({ success: false, error: 'Invalid group list' });
    return;
  }
  const sanitized = sanitizeGroupList(list);
  await set('groupLists', { ...sanitized, updatedAt: Date.now() }, list.id);
  sendResponse({ success: true });
}

async function handleDeleteGroupList(
  id: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!validateGroupListId(id)) {
    sendResponse({ success: false, error: 'Invalid group list ID' });
    return;
  }
  await del('groupLists', id);
  sendResponse({ success: true });
}

async function handleSaveTemplate(
  template: Template,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!template || !validateTemplateId(template.id)) {
    sendResponse({ success: false, error: 'Invalid template' });
    return;
  }
  const sanitized = sanitizeTemplate(template);
  await set('templates', { ...sanitized, updatedAt: Date.now() }, template.id);
  sendResponse({ success: true });
}

async function handleDeleteTemplate(
  id: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!validateTemplateId(id)) {
    sendResponse({ success: false, error: 'Invalid template ID' });
    return;
  }
  await del('templates', id);
  sendResponse({ success: true });
}

async function handleSaveImageSet(
  imageSet: ImageSet,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!imageSet || !validateImageSetId(imageSet.id)) {
    sendResponse({ success: false, error: 'Invalid image set' });
    return;
  }
  const sanitized = sanitizeImageSet(imageSet);
  await set('imageSets', sanitized, imageSet.id);
  sendResponse({ success: true });
}

async function handleDeleteImageSet(
  id: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!validateImageSetId(id)) {
    sendResponse({ success: false, error: 'Invalid image set ID' });
    return;
  }
  await del('imageSets', id);
  sendResponse({ success: true });
}

async function handleImportData(
  data: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  if (!data || typeof data !== 'string') {
    sendResponse({ success: false, error: 'Invalid import data' });
    return;
  }
  try {
    JSON.parse(data);
  } catch {
    sendResponse({ success: false, error: 'Invalid JSON data' });
    return;
  }
  try {
    await importAllData(data);
    sendResponse({ success: true });
  } catch {
    sendResponse({ success: false, error: 'Invalid backup data' });
  }
}

async function collectWhatsAppChats(): Promise<{ chats: WhatsAppChat[]; errors: string[] }> {
  const { items, errors } = await collectPagedFromTabs(
    ['*://web.whatsapp.com/*'],
    extractWhatsAppChatsFromPage,
    scrollWhatsAppChatList
  );
  return { chats: items, errors };
}

async function handleSyncWhatsAppGroups(
  _senderTabId: number | undefined,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  const { chats, errors } = await collectWhatsAppChats();
  // ponytail: "is this chat a group" is a heuristic (avatar markers + sender-prefixed
  // preview). If nothing matches, keep every chat instead of syncing nothing.
  const groups = chats.some(chat => chat.isGroup) ? chats.filter(chat => chat.isGroup) : chats;

  if (groups.length === 0) {
    sendResponse({
      success: false,
      error: `No WhatsApp groups found. Open web.whatsapp.com while logged in and try again.${errors[0] ? ` (${errors[0]})` : ''}`,
    });
    return;
  }
  await saveGroups(groups, 'whatsapp');
  sendResponse({ success: true, groups });
}

async function handleSyncMessengerGroups(
  _senderTabId: number | undefined,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  const { items: groups, errors } = await collectPagedFromTabs(
    ['*://messenger.com/*', '*://www.messenger.com/*', '*://*.facebook.com/messages/*'],
    extractMessengerGroupsFromPage,
    scrollMessengerThreadList
  );
  if (groups.length === 0) {
    sendResponse({
      success: false,
      error: `No Messenger groups found. Open messenger.com while logged in and try again.${errors[0] ? ` (${errors[0]})` : ''}`,
    });
    return;
  }
  await saveGroups(groups, 'messenger');
  sendResponse({ success: true, groups });
}

async function saveGroups(
  groups: Array<{ id: string; name: string; url?: string }>,
  platform: Group['platform']
): Promise<void> {
  const now = Date.now();
  for (const group of groups) {
    await set(
      'groups',
      { id: group.id, name: group.name, url: group.url || '', platform, addedAt: now },
      group.id
    );
  }
}

type WhatsAppChat = { id: string; name: string; isGroup: boolean };

// Current WhatsApp Web renders chat rows as role="row" inside a virtualised
// #pane-side grid, with the chat name in a [title] attribute.
function extractWhatsAppChatsFromPage(): WhatsAppChat[] {
  const rowSelectors = [
    '#pane-side [role="row"]',
    '#pane-side [data-testid^="list-item-"]',
    '[data-testid="cell-frame-container"]',
    '[role="listitem"]',
    '[data-testid="chat-list-item"]',
  ];
  const groupMarkers = ['[data-icon="default-group"]', '[data-testid="group-avatar"]'];
  // Group previews are prefixed with the sender ("Alice: hi", "~Alice: hi", "You: hi");
  // one-to-one chats show the bare message.
  const senderPrefix = /(^|\s)(?:~?[^:\n]{1,60}?|You)\s?:\s/;
  const chats: WhatsAppChat[] = [];

  const clean = (value: string) =>
    value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();

  for (const selector of rowSelectors) {
    const rows = document.querySelectorAll(selector);
    if (rows.length === 0) continue;
    for (const row of rows) {
      const titleEl = row.querySelector('[title]');
      const name = clean(
        titleEl?.getAttribute('title') ??
          (row.querySelector('[dir="auto"]') as HTMLElement | null)?.textContent ??
          ''
      );
      if (name.length < 2) continue;
      const id = 'wa_' + name.replace(/\s+/g, '_').toLowerCase();
      if (chats.some(chat => chat.id === id)) continue;
      const preview = (row.textContent || '').replace(name, ' ');
      // A phone number as the chat title is a one-to-one chat, never a group.
      const looksLikePhone = /^\+?[\d][\d\s()-]{6,}$/.test(name);
      chats.push({
        id,
        name,
        isGroup:
          !looksLikePhone &&
          (groupMarkers.some(marker => row.querySelector(marker)) || senderPrefix.test(preview)),
      });
    }
    if (chats.length > 0) break;
  }

  return chats;
}

function scrollWhatsAppChatList(): void {
  const pane = document.querySelector('#pane-side') as HTMLElement | null;
  if (pane) pane.scrollTop = pane.scrollHeight;
}

// Threads live at /messages/t/<threadId> on facebook.com and /t/<threadId> elsewhere.
// A thread is a group chat when Facebook names it after several participants
// ("Tubindra, Gita"), when the preview carries a sender prefix ("Manish: hello") or a
// membership notice ("... created the group chat"); one-to-one threads show a bare
// message preview.
function extractMessengerGroupsFromPage(): ExtractedGroup[] {
  const membership =
    /created the group chat|created this group|named the group|added you to the group|joined the group|left the group/i;
  // "You: hi" is how a one-to-one thread shows your own last message, so the sender
  // prefix only counts when it names somebody else.
  const senderPrefix = /^(?!You\b)[^:\n]{1,40}:\s/;
  const threads: ExtractedGroup[] = [];
  const seen = new Set<string>();

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/t/"]'));
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    const match = href
      .split('?')[0]
      .replace(/\/+$/, '')
      .match(/(?:messages\/)?t\/([^/]+)$/);
    if (!match) continue;
    const threadId = match[1];
    const id = 'ms_' + threadId;
    if (seen.has(id)) continue;

    const texts = Array.from(anchor.querySelectorAll('[dir="auto"]'))
      .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const name = texts[0] || '';
    if (name.length < 2) continue;
    const preview = texts[1] || '';
    const looksLikePhone = /^\+?[\d][\d\s()-]{6,}$/.test(name);
    const isGroup =
      !looksLikePhone &&
      (name.includes(', ') || membership.test(preview) || senderPrefix.test(preview));
    if (!isGroup) continue;

    seen.add(id);
    threads.push({ id, name, url: `https://www.facebook.com/messages/t/${threadId}/` });
  }

  return threads;
}

function scrollMessengerThreadList(): void {
  let node =
    (document.querySelector('a[href*="/t/"]') as HTMLElement | null)?.parentElement ?? null;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 40) {
      node.scrollTop = node.scrollHeight;
      return;
    }
    node = node.parentElement;
  }
  window.scrollTo(0, document.body.scrollHeight);
}

export async function initializeBackground(): Promise<void> {
  await recoverJobs();
  await processScheduledShares();
}
