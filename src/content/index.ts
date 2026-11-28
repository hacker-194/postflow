import { logger } from '../shared/logger';
import { initializeButtonInjector, destroyButtonInjector } from './button-injector';

logger.info('content', 'Content script loaded (modular)');

// Initialize the button injector
initializeButtonInjector();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  destroyButtonInjector();
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_GROUPS') {
    // This is now handled by background via executeScript
    sendResponse({ success: false, error: 'Use background SYNC_GROUPS instead' });
    return true;
  }
  if (message.type === 'GET_USER_SETTINGS') {
    chrome.storage.local.get('userSettings').then(({ userSettings }) => {
      sendResponse(userSettings || {});
    });
    return true;
  }
  if (message.type === 'GET_GROUP_LISTS') {
    chrome.storage.local.get('groupLists').then(({ groupLists }) => {
      sendResponse(Object.values(groupLists || {}));
    });
    return true;
  }
  if (message.type === 'GET_GROUPS_FOR_LIST') {
    chrome.storage.local.get(['groupLists', 'groups']).then(({ groupLists, groups }) => {
      const list = groupLists?.[message.listId];
      if (!list) return sendResponse([]);
      const result = list.groupIds.map((id: string) => groups?.[id]).filter(Boolean);
      sendResponse(result);
    });
    return true;
  }
  if (message.type === 'PERFORM_SHARE') {
    // Delegate to background's share-executor
    sendResponse({ success: false, error: 'Use background PERFORM_SHARE instead' });
    return true;
  }
});
