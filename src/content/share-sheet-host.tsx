/**
 * Share Sheet Host
 * Mounts React share sheet in closed Shadow DOM for CSS isolation
 */

import { logger } from '../shared/logger';
import type { GroupList, PostPreview, ShareSettings } from '../shared/types';
// Static imports on purpose: Chrome content scripts cannot use dynamic `import()`,
// so a lazily imported sheet never mounted when the button was clicked.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ShareSheet } from './ShareSheet';

let shareSheetMounted = false;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: ReactDOM.Root | null = null;

/**
 * Mount the share sheet in a closed Shadow DOM
 */
export async function mountShareSheet(preview: PostPreview): Promise<void> {
  if (shareSheetMounted) return;

  try {
    // Create host element
    const host = document.createElement('div');
    host.id = 'fgp-share-sheet-host';
    host.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      pointer-events: none;
    `;
    document.body.appendChild(host);

    // Open Shadow DOM: CSS is still isolated, but assistive tech and tooling can reach
    // the sheet (a closed root made it impossible to inspect or test reliably).
    shadowRoot = host.attachShadow({ mode: 'open' });

    // Inject styles into Shadow DOM
    injectStyles();

    // Create container for React
    const container = document.createElement('div');
    container.id = 'fgp-share-sheet-container';
    container.style.pointerEvents = 'auto';
    shadowRoot.appendChild(container);

    // Create React 18 root
    reactRoot = ReactDOM.createRoot(container);

    // Get group lists for the share sheet from the background (extension storage)
    const listsResponse = await chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' });
    const listsArray: GroupList[] = listsResponse?.data ?? [];

    // Render the share sheet
    reactRoot.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(ShareSheet, {
          preview,
          groupLists: listsArray,
          onClose: unmountShareSheet,
          onShare: handleShare,
          onSchedule: handleSchedule,
        })
      )
    );

    shareSheetMounted = true;
    logger.info('content', 'Share sheet mounted in Shadow DOM');
  } catch (error) {
    logger.error('content', 'Failed to mount share sheet', { error });
    cleanup();
  }
}

/**
 * Inject all required CSS into Shadow DOM
 */
function injectStyles(): void {
  if (!shadowRoot) return;

  const style = document.createElement('style');
  style.textContent = `
    /* Reset */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Font */
    #fgp-share-sheet-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Overlay */
    .fgp-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: fgp-fade-in 0.2s ease;
    }

    @keyframes fgp-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Sheet */
    .fgp-sheet {
      background: white;
      border-radius: 16px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: fgp-slide-up 0.2s ease;
    }

    @keyframes fgp-slide-up {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* Header */
    .fgp-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e4e6eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .fgp-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #050505;
    }

    .fgp-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      color: #65676b;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }

    .fgp-close-btn:hover {
      background: #f0f2f5;
    }

    /* Content */
    .fgp-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    /* Post Preview */
    .fgp-preview {
      background: #f0f2f5;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .fgp-preview-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .fgp-preview-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
    }

    .fgp-preview-author {
      font-weight: 600;
      font-size: 15px;
      color: #050505;
    }

    .fgp-preview-meta {
      font-size: 12px;
      color: #65676b;
    }

    .fgp-preview-text {
      font-size: 14px;
      color: #050505;
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .fgp-preview-images {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
    }

    .fgp-preview-image {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .fgp-preview-more {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      background: #e4e6eb;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #65676b;
      font-size: 12px;
      flex-shrink: 0;
    }

    .fgp-preview-video {
      color: #1877f2;
      font-size: 13px;
      margin-top: 8px;
    }

    /* Share Mode */
    .fgp-section-label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #050505;
      margin-bottom: 12px;
    }

    .fgp-mode-buttons {
      display: flex;
      gap: 8px;
    }

    .fgp-mode-btn {
      flex: 1;
      padding: 12px;
      border: 2px solid #e4e6eb;
      border-radius: 10px;
      background: white;
      color: #050505;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .fgp-mode-btn.fgp-active {
      border-color: #1877f2;
      background: #e7f3ff;
      color: #1877f2;
    }

    .fgp-mode-btn:not(.fgp-active):hover {
      border-color: #1877f2;
    }

    .fgp-mode-main {
      font-size: 14px;
    }

    .fgp-mode-sub {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 4px;
    }

    /* Inputs */
    .fgp-textarea {
      width: 100%;
      min-height: 80px;
      padding: 12px;
      border: 2px solid #e4e6eb;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      transition: border-color 0.15s ease;
    }

    .fgp-textarea:focus {
      outline: none;
      border-color: #1877f2;
    }

    .fgp-textarea-sm {
      min-height: 60px;
    }

    .fgp-button-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .fgp-secondary-btn {
      padding: 6px 12px;
      border: 1px solid #e4e6eb;
      border-radius: 6px;
      background: white;
      font-size: 12px;
      color: #65676b;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .fgp-secondary-btn:hover {
      background: #f0f2f5;
      border-color: #1877f2;
      color: #1877f2;
    }

    /* Group Selector */
    .fgp-group-selector-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .fgp-group-count {
      font-size: 13px;
      color: #65676b;
    }

    .fgp-group-lists {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .fgp-list-btn {
      padding: 8px 12px;
      border: 2px solid #1877f2;
      border-radius: 8px;
      background: white;
      color: #1877f2;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .fgp-list-btn.fgp-active,
    .fgp-list-btn:hover {
      background: #1877f2;
      color: white;
    }

    .fgp-search-input {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #e4e6eb;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 12px;
      transition: border-color 0.15s ease;
    }

    .fgp-search-input:focus {
      outline: none;
      border-color: #1877f2;
    }

    .fgp-group-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid #e4e6eb;
      border-radius: 8px;
    }

    .fgp-group-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f0f2f5;
      transition: background 0.1s ease;
    }

    .fgp-group-item:last-child {
      border-bottom: none;
    }

    .fgp-group-item:hover {
      background: #f0f2f5;
    }

    .fgp-checkbox {
      width: 18px;
      height: 18px;
      accent-color: #1877f2;
      cursor: pointer;
    }

    .fgp-group-name {
      font-size: 14px;
      color: #050505;
      flex: 1;
    }

    /* Advanced Settings */
    .fgp-advanced {
      border-top: 1px solid #e4e6eb;
      padding-top: 16px;
    }

    .fgp-details {
      margin-bottom: 16px;
    }

    .fgp-summary {
      font-size: 14px;
      font-weight: 600;
      color: #050505;
      cursor: pointer;
    }

    .fgp-settings-grid {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .fgp-setting-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .fgp-setting-label {
      font-size: 13px;
      font-weight: 500;
      color: #050505;
    }

    .fgp-safety-options {
      display: flex;
      gap: 8px;
    }

    .fgp-safety-option {
      flex: 1;
      padding: 10px;
      border: 2px solid #e4e6eb;
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
    }

    .fgp-safety-option.fgp-active,
    .fgp-safety-option:hover {
      border-color: #1877f2;
      background: #e7f3ff;
      color: #1877f2;
    }

    .fgp-safety-option input {
      display: none;
    }

    .fgp-checkbox-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .fgp-checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
      color: #050505;
    }

    .fgp-time-input {
      padding: 6px 10px;
      border: 1px solid #e4e6eb;
      border-radius: 6px;
      font-size: 13px;
    }

    .fgp-number-input {
      padding: 10px;
      border: 2px solid #e4e6eb;
      border-radius: 8px;
      width: 100px;
      font-size: 14px;
    }

    .fgp-number-input:focus {
      outline: none;
      border-color: #1877f2;
    }

    /* Footer */
    .fgp-footer {
      padding: 16px 20px;
      border-top: 1px solid #e4e6eb;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .fgp-btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .fgp-cancel-btn {
      border: 1px solid #e4e6eb;
      background: white;
      color: #050505;
    }

    .fgp-cancel-btn:hover {
      background: #f0f2f5;
    }

    .fgp-schedule-btn {
      border: none;
      background: #f0f2f5;
      color: #050505;
    }

    .fgp-schedule-btn:hover {
      background: #e4e6eb;
    }

    .fgp-share-btn {
      border: none;
      background: linear-gradient(135deg, #1877f2, #0d65d9);
      color: white;
      box-shadow: 0 2px 4px rgba(24, 119, 242, 0.3);
    }

    .fgp-share-btn:hover {
      box-shadow: 0 4px 8px rgba(24, 119, 242, 0.4);
    }

    .fgp-share-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Scrollbar */
    .fgp-content::-webkit-scrollbar {
      width: 8px;
    }

    .fgp-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .fgp-content::-webkit-scrollbar-thumb {
      background: #bcc0c4;
      border-radius: 4px;
    }

    .fgp-group-list::-webkit-scrollbar {
      width: 6px;
    }

    .fgp-group-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .fgp-group-list::-webkit-scrollbar-thumb {
      background: #bcc0c4;
      border-radius: 3px;
    }
  `;
  shadowRoot.appendChild(style);
}

/**
 * Handle share action from ShareSheet component
 */
async function handleShare(
  preview: PostPreview,
  groups: Array<{ id: string; name: string }>,
  settings: ShareSettings
): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SCHEDULE_SHARE',
      payload: {
        postUrl: preview.url,
        postPreview: preview,
        groupListId: 'manual',
        groupIds: groups.map(group => group.id),
        settings,
        scheduledAt: Date.now(),
      },
    });

    if (result.success) {
      showToast(`Sharing started to ${groups.length} groups...`);
    } else {
      showToast('Failed to start sharing: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    logger.error('content', 'Share failed', { error });
    showToast('Share failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Handle schedule action from ShareSheet component
 */
async function handleSchedule(
  preview: PostPreview,
  groups: Array<{ id: string; name: string }>,
  settings: ShareSettings,
  scheduledAt: number
): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SCHEDULE_SHARE',
      payload: {
        postUrl: preview.url,
        postPreview: preview,
        groupListId: 'manual',
        groupIds: groups.map(group => group.id),
        settings,
        scheduledAt,
      },
    });

    if (result.success) {
      showToast(`Scheduled for ${new Date(scheduledAt).toLocaleString()}`);
    } else {
      showToast('Failed to schedule: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    logger.error('content', 'Schedule failed', { error });
    showToast('Schedule failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Unmount the share sheet
 */
export function unmountShareSheet(): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (shadowRoot) {
    const host = shadowRoot.host;
    host.remove();
    shadowRoot = null;
  }
  shareSheetMounted = false;
  logger.info('content', 'Share sheet unmounted');
}

/**
 * Cleanup on error
 */
function cleanup(): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (shadowRoot) {
    const host = shadowRoot.host;
    host.remove();
    shadowRoot = null;
  }
  shareSheetMounted = false;
}

/**
 * Show toast notification
 */
function showToast(message: string): void {
  // Use document (not shadow DOM) for toast so it's always visible
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #050505;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: fgp-slide-in 0.3s ease;
  `;

  if (!document.getElementById('fgp-toast-style')) {
    const style = document.createElement('style');
    style.id = 'fgp-toast-style';
    style.textContent = `
      @keyframes fgp-slide-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fgp-slide-in 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
