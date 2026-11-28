import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb/lib/FDBFactory';

// Mock IndexedDB
global.indexedDB = indexedDB as unknown as IDBFactory;
global.IDBKeyRange = indexedDB.IDBKeyRange;

type MockEvent = {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  hasListener: ReturnType<typeof vi.fn>;
  getRules: ReturnType<typeof vi.fn>;
  hasRules: ReturnType<typeof vi.fn>;
  removeRules: ReturnType<typeof vi.fn>;
  addRules: ReturnType<typeof vi.fn>;
};

type MockStorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  getBytesInUse: ReturnType<typeof vi.fn>;
  setAccessLevel: ReturnType<typeof vi.fn>;
  onChanged: MockEvent;
};

const mockEvent = (): MockEvent => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn(),
  getRules: vi.fn(),
  hasRules: vi.fn(),
  removeRules: vi.fn(),
  addRules: vi.fn(),
});

const mockStorageArea = (): MockStorageArea => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  getBytesInUse: vi.fn(),
  setAccessLevel: vi.fn(),
  onChanged: mockEvent(),
});

global.chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: mockEvent(),
    onInstalled: mockEvent(),
    onStartup: mockEvent(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    openOptionsPage: vi.fn(),
    getManifest: vi.fn(),
    getPackageDirectoryEntry: vi.fn(),
    getPlatformInfo: vi.fn(),
    lastError: undefined,
    reload: vi.fn(),
    requestUpdateCheck: vi.fn(),
    restart: vi.fn(),
    setUninstallURL: vi.fn(),
    connect: vi.fn(),
    connectNative: vi.fn(),
    onConnect: mockEvent(),
    onConnectExternal: mockEvent(),
    onMessageExternal: mockEvent(),
    onRestartRequired: mockEvent(),
    onUpdateAvailable: mockEvent(),
    getBackgroundPage: vi.fn(),
    getContexts: vi.fn(),
    restartAfterDelay: vi.fn(),
    sendNativeMessage: vi.fn(),
  },
  storage: {
    local: mockStorageArea(),
    sync: mockStorageArea(),
    managed: mockStorageArea(),
    session: mockStorageArea(),
    onChanged: mockEvent(),
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    getAllInWindow: vi.fn(),
    getCurrent: vi.fn(),
    getZoom: vi.fn(),
    setZoom: vi.fn(),
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
    reload: vi.fn(),
    highlight: vi.fn(),
    detectLanguage: vi.fn(),
    captureVisibleTab: vi.fn(),
    onActivated: mockEvent(),
    onCreated: mockEvent(),
    onRemoved: mockEvent(),
    onUpdated: mockEvent(),
    onMoved: mockEvent(),
    onReplaced: mockEvent(),
    onZoomChange: mockEvent(),
    getSelected: vi.fn(),
    move: vi.fn(),
    duplicate: vi.fn(),
    sendMessage: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    onAlarm: mockEvent(),
  },
  notifications: {
    create: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
    getAll: vi.fn(),
    onClicked: mockEvent(),
    onButtonClicked: mockEvent(),
    onClosed: mockEvent(),
    onPermissionLevelChanged: mockEvent(),
    getPermissionLevel: vi.fn(),
    onShowSettings: mockEvent(),
  },
  scripting: {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
    removeCSS: vi.fn(),
    registerContentScripts: vi.fn(),
    unregisterContentScripts: vi.fn(),
    getRegisteredContentScripts: vi.fn(),
    updateContentScripts: vi.fn(),
  },
  contextMenus: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    onClicked: mockEvent(),
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
    getAcceptLanguages: vi.fn(),
    getUILanguage: vi.fn(),
    detectLanguage: vi.fn(),
  },
  action: {
    setTitle: vi.fn(),
    getTitle: vi.fn(),
    setIcon: vi.fn(),
    setBadgeText: vi.fn(),
    getBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    getBadgeBackgroundColor: vi.fn(),
    setPopup: vi.fn(),
    getPopup: vi.fn(),
    setBadgeTextColor: vi.fn(),
    getBadgeTextColor: vi.fn(),
    onClicked: mockEvent(),
    disable: vi.fn(),
    enable: vi.fn(),
    getUserSettings: vi.fn(),
    isEnabled: vi.fn(),
    openPopup: vi.fn(),
  },
};

global.HTMLElement.prototype.scrollIntoView = vi.fn();
global.HTMLElement.prototype.focus = vi.fn();
global.HTMLElement.prototype.click = vi.fn();
