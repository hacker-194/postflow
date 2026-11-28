/**
 * IndexedDB Storage Wrapper (via idb)
 * Namespaced keys, schema validation, single instance.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { logger } from './logger';
import type {
  StorageSchema,
  UserSettings,
  ShareSettings,
  Group,
  GroupList,
  ScheduledShare,
  ShareResult,
  ImageSet,
  Template,
  JobCheckpoint,
} from './types';
import { DEFAULT_USER_SETTINGS, DEFAULT_SHARE_SETTINGS } from './constants';

const DB_NAME = 'fgp-storage';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

interface FGPStorage extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: StorageSchema[keyof StorageSchema];
  };
}

let dbPromise: Promise<IDBPDatabase<FGPStorage>> | null = null;

function getDB(): Promise<IDBPDatabase<FGPStorage>> {
  if (!dbPromise) {
    dbPromise = openDB<FGPStorage>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
}

const PREFIX = 'fgp';

function makeKey(namespace: string, id?: string): string {
  return id ? `${PREFIX}/${namespace}/${id}` : `${PREFIX}/${namespace}`;
}

export async function get<T = unknown>(namespace: string, id?: string): Promise<T | undefined> {
  const db = await getDB();
  const key = makeKey(namespace, id);
  return db.get(STORE_NAME, key) as Promise<T | undefined>;
}

export async function getAll<T = unknown>(namespace: string): Promise<Record<string, T>> {
  const db = await getDB();
  const namespacePrefix = `${makeKey(namespace)}/`;
  const keys = await db.getAllKeys(STORE_NAME);
  const matchingKeys = keys.filter(
    (key): key is string => typeof key === 'string' && key.startsWith(namespacePrefix)
  );

  const entries = await Promise.all(
    matchingKeys.map(async key => ({
      id: key.slice(namespacePrefix.length),
      value: await db.get(STORE_NAME, key),
    }))
  );

  const result: Record<string, T> = {};
  for (const { id, value } of entries) {
    if (id && value !== undefined) result[id] = value as T;
  }
  return result;
}

export async function set(namespace: string, value: unknown, id?: string): Promise<void> {
  const db = await getDB();
  const key = makeKey(namespace, id);
  const current = await db.get(STORE_NAME, key);
  const newValue =
    typeof value === 'function' ? (value as (prev: unknown) => unknown)(current) : value;
  await db.put(STORE_NAME, newValue as FGPStorage[typeof STORE_NAME]['value'], key);
}

export async function del(namespace: string, id: string): Promise<void> {
  const db = await getDB();
  const key = makeKey(namespace, id);
  await db.delete(STORE_NAME, key);
}

export async function clearNamespace(namespace: string): Promise<void> {
  const db = await getDB();
  const namespaceKey = makeKey(namespace);
  const namespacePrefix = `${namespaceKey}/`;
  const keys = await db.getAllKeys(STORE_NAME);
  const matchingKeys = keys.filter(
    (key): key is string =>
      typeof key === 'string' && (key === namespaceKey || key.startsWith(namespacePrefix))
  );

  if (matchingKeys.length === 0) return;

  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all(matchingKeys.map(key => tx.store.delete(key)));
  await tx.done;
}

// Typed helpers
export async function getUserSettings(): Promise<UserSettings> {
  const settings = await get<UserSettings>('userSettings');
  return { ...DEFAULT_USER_SETTINGS, ...settings };
}

export async function setUserSettings(partial: Partial<UserSettings>): Promise<void> {
  const current = await getUserSettings();
  await set('userSettings', { ...current, ...partial });
}

export async function getShareSettings(): Promise<ShareSettings> {
  return DEFAULT_SHARE_SETTINGS;
}

export async function getGroups(): Promise<Record<string, Group>> {
  return getAll<Group>('groups');
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return get<Group>('groups', id);
}

export async function setGroup(group: Group): Promise<void> {
  await set('groups', group, group.id);
}

export async function deleteGroup(id: string): Promise<void> {
  await del('groups', id);
}

export async function getGroupLists(): Promise<Record<string, GroupList>> {
  return getAll<GroupList>('groupLists');
}

export async function getGroupList(id: string): Promise<GroupList | undefined> {
  return get<GroupList>('groupLists', id);
}

export async function setGroupList(list: GroupList): Promise<void> {
  await set('groupLists', { ...list, updatedAt: Date.now() }, list.id);
}

export async function deleteGroupList(id: string): Promise<void> {
  await del('groupLists', id);
}

export async function getGroupsForList(listId: string): Promise<Group[]> {
  const list = await get<GroupList>('groupLists', listId);
  if (!list) return [];
  const groups = await getGroups();
  return list.groupIds.map(id => groups[id]).filter(Boolean) as Group[];
}

export async function getScheduledShares(): Promise<Record<string, ScheduledShare>> {
  return getAll<ScheduledShare>('scheduledShares');
}

export async function getScheduledShare(id: string): Promise<ScheduledShare | undefined> {
  return get<ScheduledShare>('scheduledShares', id);
}

export async function setScheduledShare(share: ScheduledShare): Promise<void> {
  await set('scheduledShares', share, share.id);
}

export async function deleteScheduledShare(id: string): Promise<void> {
  await del('scheduledShares', id);
}

export async function getShareHistory(): Promise<Record<string, ShareResult>> {
  return getAll<ShareResult>('shareHistory');
}

export async function setShareHistory(result: ShareResult): Promise<void> {
  await set('shareHistory', result, result.id);
}

export async function getImageSets(): Promise<Record<string, ImageSet>> {
  return getAll<ImageSet>('imageSets');
}

export async function setImageSet(imageSet: ImageSet): Promise<void> {
  await set('imageSets', imageSet, imageSet.id);
}

export async function deleteImageSet(id: string): Promise<void> {
  await del('imageSets', id);
}

export async function getTemplates(): Promise<Record<string, Template>> {
  return getAll<Template>('templates');
}

export async function setTemplate(template: Template): Promise<void> {
  await set('templates', { ...template, updatedAt: Date.now() }, template.id);
}

export async function deleteTemplate(id: string): Promise<void> {
  await del('templates', id);
}

export async function getJobCheckpoints(): Promise<Record<string, JobCheckpoint>> {
  return getAll<JobCheckpoint>('jobCheckpoints');
}

export async function setJobCheckpoint(checkpoint: JobCheckpoint): Promise<void> {
  await set('jobCheckpoints', checkpoint, checkpoint.shareId);
}

export async function deleteJobCheckpoint(shareId: string): Promise<void> {
  await del('jobCheckpoints', shareId);
}

export async function getDailyPosts(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const storedDate = await get<string>('dailyPostsDate');
  if (storedDate !== today) {
    await set('dailyPosts', 0);
    await set('dailyPostsDate', today);
    return 0;
  }
  return (await get<number>('dailyPosts')) || 0;
}

export async function incrementDailyPosts(count: number): Promise<number> {
  const current = await getDailyPosts();
  const newValue = current + count;
  await set('dailyPosts', newValue);
  return newValue;
}

export async function resetDailyPosts(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await set('dailyPosts', 0);
  await set('dailyPostsDate', today);
}

export async function getFreeSharesUsed(): Promise<number> {
  return (await get<number>('freeSharesUsed')) || 0;
}

export async function incrementFreeSharesUsed(count: number): Promise<number> {
  const current = await getFreeSharesUsed();
  const newValue = Math.min(current + count, 6);
  await set('freeSharesUsed', newValue);
  return newValue;
}

export async function resetFreeSharesDaily(): Promise<void> {
  await set('freeSharesUsed', 0);
}

export async function exportAllData(): Promise<string> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  const data: Record<string, unknown> = {};

  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(`${PREFIX}/`)) continue;
    const value = await db.get(STORE_NAME, key);
    if (value !== undefined) data[key] = value;
  }

  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const parsed: unknown = JSON.parse(json);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Backup must be a JSON object');
  }

  const data = parsed as Record<string, unknown>;
  const entries = Object.entries(data).filter(([key]) => key.startsWith(`${PREFIX}/`));
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');

  for (const [key, value] of entries) {
    await tx.store.put(value as FGPStorage[typeof STORE_NAME]['value'], key);
  }

  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const namespaces = [
    'groups',
    'groupLists',
    'scheduledShares',
    'shareHistory',
    'imageSets',
    'templates',
    'userSettings',
    'jobCheckpoints',
  ];
  for (const ns of namespaces) {
    await clearNamespace(ns);
  }
  await set('userSettings', DEFAULT_USER_SETTINGS);
  await set('dailyPosts', 0);
  await set('dailyPostsDate', new Date().toISOString().split('T')[0]);
  await set('freeSharesUsed', 0);
}

export async function initializeDefaults(): Promise<void> {
  const existing = await get<UserSettings>('userSettings');
  if (!existing) {
    await set('userSettings', DEFAULT_USER_SETTINGS);
    logger.info('storage', 'Initialized default user settings');
  }
  const dailyPosts = await get<number>('dailyPosts');
  if (dailyPosts === undefined) {
    await set('dailyPosts', 0);
    await set('dailyPostsDate', new Date().toISOString().split('T')[0]);
  }
  const freeSharesUsed = await get<number>('freeSharesUsed');
  if (freeSharesUsed === undefined) {
    await set('freeSharesUsed', 0);
  }
  logger.info('storage', 'Defaults initialized');
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' || area === 'sync') {
    logger.debug('storage', 'Storage changed', { keys: Object.keys(changes) });
  }
});
