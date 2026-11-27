import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearNamespace, exportAllData, get, getAll, importAllData, set } from '../shared/storage';

const storageMocks = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const db = {
    get: vi.fn(async (_storeName: string, key: string) => records.get(key)),
    getAll: vi.fn(async (_storeName: string) => Array.from(records.values())),
    getAllKeys: vi.fn(async (_storeName: string) => Array.from(records.keys())),
    put: vi.fn(async (_storeName: string, value: unknown, key: string) => {
      records.set(key, value);
    }),
    delete: vi.fn(async (_storeName: string, key: string) => {
      records.delete(key);
    }),
    transaction: vi.fn(() => ({
      store: {
        delete: vi.fn(async (key: string) => {
          records.delete(key);
        }),
        put: vi.fn(async (value: unknown, key: string) => {
          records.set(key, value);
        }),
      },
      done: Promise.resolve(),
    })),
    createObjectStore: vi.fn(),
  };

  return {
    records,
    db,
    openDB: vi.fn(async () => db),
  };
});

vi.mock('idb', () => ({ openDB: storageMocks.openDB }));

describe('Storage', () => {
  beforeEach(() => {
    storageMocks.records.clear();
    vi.clearAllMocks();
  });

  it('get returns undefined for a missing key', async () => {
    await expect(get('groups', 'missing')).resolves.toBeUndefined();
  });

  it('set writes a namespaced record', async () => {
    const value = { id: 'group-1', name: 'Test group' };
    await set('groups', value, 'group-1');

    expect(storageMocks.records.get('fgp/groups/group-1')).toEqual(value);
  });

  it('getAll returns only records from the requested namespace', async () => {
    const group = { id: 'group-1', name: 'A group' };
    const list = { id: 'list-1', name: 'A list' };
    await set('groups', group, 'group-1');
    await set('groupLists', list, 'list-1');
    await set('userSettings', { theme: 'dark' });

    await expect(getAll('groups')).resolves.toEqual({ 'group-1': group });
    await expect(getAll('groupLists')).resolves.toEqual({ 'list-1': list });
  });

  it('clears only the requested namespace, including its singleton key', async () => {
    await set('groups', { id: 'group-1' }, 'group-1');
    await set('groupLists', { id: 'list-1' }, 'list-1');
    await set('userSettings', { theme: 'dark' });

    await clearNamespace('groups');

    expect(storageMocks.records.has('fgp/groups/group-1')).toBe(false);
    expect(storageMocks.records.has('fgp/groupLists/list-1')).toBe(true);
    expect(storageMocks.records.has('fgp/userSettings')).toBe(true);
  });

  it('exports and imports complete namespaced keys', async () => {
    const value = { id: 'template-1', name: 'Welcome' };
    await set('templates', value, 'template-1');

    const backup = await exportAllData();
    storageMocks.records.clear();
    await importAllData(backup);

    expect(storageMocks.records.get('fgp/templates/template-1')).toEqual(value);
  });

  it('rejects a backup that is not a JSON object', async () => {
    await expect(importAllData('[]')).rejects.toThrow('Backup must be a JSON object');
  });
});
