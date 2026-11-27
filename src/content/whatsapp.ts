import { logger } from '../shared/logger';
import type { UserSettings } from '../shared/types';
import { sanitizeHtml } from '../shared/security';

logger.info('content-whatsapp', 'WhatsApp content script loaded');

let shareButtonInjected = false;
let shareSheetInjected = false;
let observer: MutationObserver | null = null;

async function getUserSettings(): Promise<UserSettings> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }, response => {
      resolve(response || {});
    });
  });
}

function escapeHtml(text: string): string {
  return sanitizeHtml(text);
}

function initialize(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupObserver();
      injectShareButton();
    });
  } else {
    setupObserver();
    injectShareButton();
  }
}

function setupObserver(): void {
  observer = new MutationObserver(() => {
    checkForForwardButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function checkForForwardButtons(): void {
  // WhatsApp Web forward button selectors (updated for current UI)
  const forwardSelectors = [
    '[data-testid="forward"]',
    '[data-testid="msg-forward"]',
    '[aria-label*="Forward" i]',
    '[aria-label*="forward" i]',
    '[data-icon="forward"]',
    '[data-icon="forward-filled"]',
    'span[data-icon="forward"]',
    'button[aria-label*="Forward" i]',
    'div[role="button"][aria-label*="Forward" i]',
  ];

  for (const selector of forwardSelectors) {
    const buttons = document.querySelectorAll(selector);
    if (buttons.length > 0) {
      logger.debug('content-whatsapp', 'Found forward buttons', {
        selector,
        count: buttons.length,
      });
      if (!shareButtonInjected) {
        injectShareButton();
      }
      return;
    }
  }
  logger.debug('content-whatsapp', 'No forward buttons found with any selector');
}

async function injectShareButton(): Promise<void> {
  const userSettings = await getUserSettings();
  if (!userSettings.showShareButton) return;

  // Try multiple selectors for the forward button
  const forwardSelectors = [
    '[data-testid="forward"]',
    '[data-testid="msg-forward"]',
    '[aria-label*="Forward" i]',
    '[aria-label*="forward" i]',
    '[data-icon="forward"]',
    '[data-icon="forward-filled"]',
    'span[data-icon="forward"]',
    'button[aria-label*="Forward" i]',
    'div[role="button"][aria-label*="Forward" i]',
  ];

  let injected = false;
  for (const selector of forwardSelectors) {
    const forwardButtons = document.querySelectorAll(selector);
    for (const btn of forwardButtons) {
      if (btn.parentElement?.querySelector('.fgp-share-to-groups-btn')) continue;

      const fgpButton = createShareButton();
      const position = userSettings.shareButtonPosition;

      if (position === 'after_share') {
        btn.parentElement?.insertBefore(fgpButton, btn.nextSibling);
      } else if (position === 'before_share') {
        btn.parentElement?.insertBefore(fgpButton, btn);
      }
      injected = true;
      logger.info('content-whatsapp', 'Share button injected', { selector });
    }
    if (injected) break;
  }

  if (!injected) {
    logger.warn('content-whatsapp', 'Could not inject share button - no forward button found');
    // Fallback: try to find any button in the message menu/footer area
    injectFallbackButton();
  } else {
    shareButtonInjected = true;
  }
}

function injectFallbackButton(): void {
  // Try to find the message input footer area and add a floating button there
  const footerSelectors = [
    'footer[role="region"]',
    'footer',
    '[data-testid="conversation-compose-box"]',
    'div[role="region"][aria-label*="Type"]',
  ];

  for (const selector of footerSelectors) {
    const footer = document.querySelector(selector);
    if (footer && !footer.querySelector('.fgp-share-to-groups-btn')) {
      const fgpButton = createShareButton();
      fgpButton.style.position = 'relative';
      fgpButton.style.marginLeft = '8px';
      footer.appendChild(fgpButton);
      logger.info('content-whatsapp', 'Injected fallback button in footer', { selector });
      shareButtonInjected = true;
      return;
    }
  }
}

function createShareButton(): HTMLElement {
  const button = document.createElement('button');
  button.className = 'fgp-share-to-groups-btn';
  button.setAttribute('data-testid', 'fgp-share-to-groups-whatsapp');
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: linear-gradient(135deg, #25d366, #128c7e);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(37, 211, 102, 0.3);
    z-index: 1000;
  `;
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="9" x2="21" y2="3"></line>
    </svg>
    Forward to Contacts
  `;

  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openShareSheet();
  });

  return button;
}

async function openShareSheet(): Promise<void> {
  if (shareSheetInjected) return;

  const groups = await getWhatsAppGroups();
  const userSettings = await getUserSettings();

  const sheet = createShareSheet(groups, userSettings);
  document.body.appendChild(sheet);
  shareSheetInjected = true;

  document.addEventListener('keydown', handleEscape, { once: true });
}

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeShareSheet();
  }
}

function closeShareSheet(): void {
  const sheet = document.querySelector('.fgp-share-sheet-overlay');
  if (sheet) {
    sheet.remove();
    shareSheetInjected = false;
  }
}

async function getWhatsAppGroups(): Promise<Array<{ id: string; name: string }>> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_WHATSAPP_GROUPS' }, response => {
      // Handle both array and object responses
      if (Array.isArray(response)) {
        resolve(response);
      } else if (response && typeof response === 'object') {
        resolve(Object.values(response));
      } else {
        resolve([]);
      }
    });
  });
}

function createShareSheet(
  groups: Array<{ id: string; name: string }>,
  userSettings: UserSettings
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'fgp-share-sheet-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const sheet = document.createElement('div');
  sheet.className = 'fgp-share-sheet';
  sheet.style.cssText = `
    background: ${userSettings.theme === 'dark' ? '#242526' : '#ffffff'};
    border-radius: 16px;
    padding: 24px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: ${userSettings.theme === 'dark' ? '#e4e6eb' : '#050505'};
  `;

  sheet.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Forward to WhatsApp Contacts</h2>
      <button class="fgp-close-btn" style="
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        padding: 0;
        line-height: 1;
      ">×</button>
    </div>
    <p style="margin: 0 0 16px; font-size: 14px; opacity: 0.7;">
      Select contacts or groups to forward this message to.
    </p>
    <div class="fgp-group-search" style="margin-bottom: 16px;">
      <input type="text" placeholder="Search contacts/groups..." style="
        width: 100%;
        padding: 12px 16px;
        border: 1px solid ${userSettings.theme === 'dark' ? '#3a3b3c' : '#e4e6eb'};
        border-radius: 8px;
        background: ${userSettings.theme === 'dark' ? '#3a3b3c' : '#f0f2f5'};
        color: inherit;
        font-size: 14px;
        box-sizing: border-box;
      ">
    </div>
    <div class="fgp-group-list" style="max-height: 300px; overflow-y: auto;">
      ${
        groups.length === 0
          ? '<p style="text-align: center; padding: 20px; opacity: 0.6;">No WhatsApp groups synced yet. Open WhatsApp Web and click "Sync Groups" in extension options.</p>'
          : groups
              .map(
                g => `
            <label style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px;
              border-radius: 8px;
              cursor: pointer;
              transition: background 0.15s;
              border: 1px solid ${userSettings.theme === 'dark' ? '#3a3b3c' : '#e4e6eb'};
              margin-bottom: 8px;
            " onmouseover="this.style.background='${userSettings.theme === 'dark' ? '#3a3b3c' : '#f0f2f5'}'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" value="${escapeHtml(g.id)}" style="width: 18px; height: 18px; accent-color: #25d366;">
              <span style="flex: 1; font-size: 14px;">${escapeHtml(g.name)}</span>
            </label>
          `
              )
              .join('')
      }
    </div>
    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid ${userSettings.theme === 'dark' ? '#3a3b3c' : '#e4e6eb'};">
      <button class="fgp-cancel-btn" style="
        padding: 10px 20px;
        border: 1px solid ${userSettings.theme === 'dark' ? '#3a3b3c' : '#e4e6eb'};
        background: transparent;
        color: inherit;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      ">Cancel</button>
      <button class="fgp-forward-btn" style="
        padding: 10px 20px;
        border: none;
        background: linear-gradient(135deg, #25d366, #128c7e);
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      ">Forward to Selected</button>
    </div>
  `;

  overlay.appendChild(sheet);

  overlay.querySelector('.fgp-close-btn')?.addEventListener('click', closeShareSheet);
  overlay.querySelector('.fgp-cancel-btn')?.addEventListener('click', closeShareSheet);
  overlay
    .querySelector('.fgp-forward-btn')
    ?.addEventListener('click', () => forwardToSelected(sheet));

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeShareSheet();
  });

  return overlay;
}

async function forwardToSelected(sheet: HTMLElement): Promise<void> {
  const checkboxes = sheet.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);

  if (selectedIds.length === 0) {
    alert('Please select at least one contact/group');
    return;
  }

  closeShareSheet();

  const messageData = await getMessageData();
  if (!messageData) {
    alert('Could not find message to forward');
    return;
  }

  for (const contactId of selectedIds) {
    try {
      await forwardMessage(contactId, messageData);
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error('Failed to forward:', error);
      alert(
        `Failed to forward to ${contactId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

async function getMessageData(): Promise<{ text?: string; media?: boolean } | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_MESSAGE' }, response => {
      resolve(response || null);
    });
  });
}

async function forwardMessage(
  contactId: string,
  messageData: { text?: string; media?: boolean }
): Promise<void> {
  // Extract the original contact name from the ID (format: wa_name_with_underscores)
  const contactName = contactId.replace('wa_', '').replace(/_/g, ' ');

  // Find the chat in the chat list
  const chatElement = await findChatByName(contactName);
  if (!chatElement) {
    throw new Error(`Chat "${contactName}" not found in chat list`);
  }

  // Click the chat to open it
  chatElement.click();
  await sleep(800);

  // Find and fill the message input
  const messageInput = await findMessageInput();
  if (!messageInput) {
    throw new Error('Message input not found');
  }

  if (messageData.text) {
    await typeMessage(messageInput, messageData.text);
    await sleep(300);
  }

  // Find and click send button
  const sendButton = await findSendButton();
  if (!sendButton) {
    throw new Error('Send button not found');
  }

  sendButton.click();
  await sleep(500);
}

function findChatByName(name: string): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const search = () => {
      // WhatsApp Web chat list items - multiple selector strategies
      const chatSelectors = [
        '[role="listitem"]',
        '[data-testid="chat-list-item"]',
        '[data-testid="cell-frame-container"]',
        'div[role="row"]',
        '._ak8l',
        '._ak8o',
        '._ak8q',
        '._ak8s',
        '.x1yztbdb',
        '.x1n2onr6',
      ];

      const nameSelectors = [
        '[dir="auto"]',
        '[data-testid="cell-frame-title"]',
        '[data-testid="contact-name"]',
        '._ao3e',
        '.x1iyjqo2',
        'span[title]',
        'span[dir="auto"]',
        'div[dir="auto"]',
      ];

      for (const chatSel of chatSelectors) {
        const chatItems = document.querySelectorAll(chatSel);
        for (const item of chatItems) {
          let itemName = '';
          for (const nameSel of nameSelectors) {
            const nameEl = item.querySelector(nameSel) as HTMLElement;
            if (nameEl?.textContent?.trim()) {
              itemName = nameEl.textContent.trim();
              break;
            }
          }
          if (!itemName && item.textContent?.trim()) {
            const text = item.textContent.trim();
            if (text.length > 1 && text.length < 100 && !text.includes('\n')) {
              itemName = text;
            }
          }
          if (itemName && itemName.toLowerCase() === name.toLowerCase()) {
            resolve(item as HTMLElement);
            return;
          }
        }
      }
      resolve(null);
    };

    search();

    // If not found, wait for chat list to load
    const observer = new MutationObserver(() => {
      search();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout after 10 seconds
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 10000);
  });
}

function findMessageInput(): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const search = () => {
      // WhatsApp Web message input selectors
      const selectors = [
        '[data-testid="conversation-compose-box-input"]',
        '[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][role="textbox"]',
        'footer [contenteditable="true"]',
        '[data-testid="compose-box-input"]',
      ];

      for (const selector of selectors) {
        const input = document.querySelector(selector) as HTMLElement;
        if (input) {
          resolve(input);
          return;
        }
      }
      resolve(null);
    };

    search();

    const observer = new MutationObserver(() => {
      search();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 5000);
  });
}

async function typeMessage(input: HTMLElement, text: string): Promise<void> {
  input.focus();
  await sleep(100);

  // Clear existing content
  input.textContent = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(50);

  // Type the message
  input.textContent = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(100);
}

function findSendButton(): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const search = () => {
      const selectors = [
        '[data-testid="compose-btn-send"]',
        '[data-testid="send"]',
        'button[aria-label="Send"]',
        'span[data-icon="send"]',
        'button:has(span[data-icon="send"])',
        'footer button[type="submit"]',
      ];

      for (const selector of selectors) {
        const btn = document.querySelector(selector) as HTMLElement;
        if (btn && !btn.hasAttribute('disabled')) {
          resolve(btn);
          return;
        }
      }
      resolve(null);
    };

    search();

    const observer = new MutationObserver(() => {
      search();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 5000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

initialize();
