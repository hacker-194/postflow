import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { logger } from './logger';
import type { StorageSchema, UserSettings } from './types';
import { DEFAULT_USER_SETTINGS } from './types';

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

function getDB() {
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

export async function get<T = any>(namespace: string, id?: string): Promise<T | undefined> {
  const db = await getDB();
  const key = makeKey(namespace, id);
  return db.get(STORE_NAME, key) as Promise<T | undefined>;
}

export async function getAll<T = any>(namespace: string): Promise<Record<string, T>> {
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
  await db.put(STORE_NAME, newValue as any, key);
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

export async function getUserSettings(): Promise<UserSettings> {
  const settings = await get<UserSettings>('userSettings');
  return { ...DEFAULT_USER_SETTINGS, ...settings };
}

export async function setUserSettings(partial: Partial<UserSettings>): Promise<void> {
  const current = await getUserSettings();
  await set('userSettings', { ...current, ...partial });
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
    // Preserve the complete key: runtime reads and writes use the same fgp/<namespace> path.
    await tx.store.put(value as FGPStorage[typeof STORE_NAME]['value'], key);
  }

  await tx.done;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' || area === 'sync') {
    logger.debug('storage', 'Storage changed', { keys: Object.keys(changes) });
  }
});
