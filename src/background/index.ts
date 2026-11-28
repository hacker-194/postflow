/**
 * Background Service Worker Entry Point
 * Manifest V3 service worker for Free Group Poster
 */

import { logger } from '../shared/logger';
import { setupAlarms, processScheduledShares } from './scheduler';
import { setupMessageHandlers, initializeBackground } from './messages';
import { initializeDefaults } from '../shared/storage';

const ALARM_NAME = 'fgp-scheduler';

logger.info('background', 'Service worker starting');

chrome.runtime.onInstalled.addListener(async details => {
  logger.info('background', 'Extension installed', { reason: details.reason });
  if (details.reason === 'install') {
    await initializeDefaults();
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
  await setupAlarms();
  await initializeBackground();
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info('background', 'Browser startup');
  await setupAlarms();
  await initializeBackground();
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === ALARM_NAME) {
    await processScheduledShares();
  }
});

setupMessageHandlers();

logger.info('background', 'Service worker initialized');
