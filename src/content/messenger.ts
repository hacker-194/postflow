// Self-contained Messenger content script - no external imports for ISOLATED world compatibility

// --- Inlined Logger ---
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private minLevel: LogLevel = 'info';

  private levelValue(level: LogLevel): number {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelValue(level) >= this.levelValue(this.minLevel);
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = { timestamp: Date.now(), level, context, message, data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${context}]`;
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      case 'info':
        console.info(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }

  debug(context: string, message: string, data?: unknown): void {
    this.log('debug', context, message, data);
  }
  info(context: string, message: string, data?: unknown): void {
    this.log('info', context, message, data);
  }
  warn(context: string, message: string, data?: unknown): void {
    this.log('warn', context, message, data);
  }
  error(context: string, message: string, data?: unknown): void {
    this.log('error', context, message, data);
  }
}

const logger = new Logger();
// --- End Logger ---

// --- Inlined sanitizeHtml ---
function sanitizeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}
// --- End sanitizeHtml ---

logger.info('content-messenger', 'Messenger content script loaded');

let shareButtonInjected = false;
let shareSheetInjected = false;
let observer: MutationObserver | null = null;

interface UserSettings {
  showShareButton: boolean;
  shareButtonPosition: 'after_share' | 'before_share';
  theme: 'light' | 'dark';
}

async function getUserSettings(): Promise<UserSettings> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }, response => {
      resolve({
        showShareButton: true,
        shareButtonPosition: 'after_share',
        theme: 'light',
        ...(response?.success ? response.data : null),
      });
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
    checkForShareButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function checkForShareButtons(): void {
  // Check for share buttons on both messenger.com and facebook.com/messages.
  const shareSelectors = [
    // messenger.com selectors
    '[data-testid="share-button"]',
    '[aria-label*="Share" i]',
    '[aria-label*="share" i]',
    'button[aria-label*="Share" i]',
    'div[role="button"][aria-label*="Share" i]',
    '[data-testid="share"]',
    '[data-icon="share"]',
    // facebook.com/messages selectors (newer UI)
    '[data-testid="composer"] [role="button"][aria-label*="Share"]',
    '[data-testid="share"]',
    'div[role="button"]:has-text("Share")',
    'button[aria-label*="share" i]',
  ];

  for (const selector of shareSelectors) {
    const buttons = document.querySelectorAll(selector);
    if (buttons.length > 0) {
      logger.debug('content-messenger', 'Found share buttons', { selector, count: buttons.length });
      if (!shareButtonInjected) {
        injectShareButton();
      }
      return;
    }
  }
  logger.debug('content-messenger', 'No share buttons found with any selector');
}

async function injectShareButton(): Promise<void> {
  const userSettings = await getUserSettings();
  if (!userSettings.showShareButton) return;

  const shareSelectors = [
    '[data-testid="share-button"]',
    '[aria-label*="Share" i]',
    '[aria-label*="share" i]',
    'button[aria-label*="Share" i]',
    'div[role="button"][aria-label*="Share" i]',
    '[data-testid="share"]',
    '[data-icon="share"]',
  ];

  let injected = false;
  for (const selector of shareSelectors) {
    const shareButtons = document.querySelectorAll(selector);
    for (const btn of shareButtons) {
      if (btn.parentElement?.querySelector('.fgp-share-to-groups-btn')) continue;

      const fgpButton = createShareButton();
      const position = userSettings.shareButtonPosition;

      if (position === 'after_share') {
        btn.parentElement?.insertBefore(fgpButton, btn.nextSibling);
      } else if (position === 'before_share') {
        btn.parentElement?.insertBefore(fgpButton, btn);
      }
      injected = true;
      logger.info('content-messenger', 'Share button injected', { selector });
    }
    if (injected) break;
  }

  if (!injected) {
    logger.warn('content-messenger', 'Could not inject share button - no share button found');
    injectFallbackButton();
  } else {
    shareButtonInjected = true;
  }
}

function injectFallbackButton(): void {
  const footerSelectors = [
    '[data-testid="composer"]',
    '[role="textbox"]',
    'div[contenteditable="true"][role="textbox"]',
    'footer',
    '[aria-label*="Message"]',
  ];

  for (const selector of footerSelectors) {
    const footer = document.querySelector(selector);
    if (footer && !footer.querySelector('.fgp-share-to-groups-btn')) {
      const fgpButton = createShareButton();
      fgpButton.style.position = 'relative';
      fgpButton.style.marginLeft = '8px';
      footer.appendChild(fgpButton);
      logger.info('content-messenger', 'Injected fallback button', { selector });
      shareButtonInjected = true;
      return;
    }
  }
}

function createShareButton(): HTMLElement {
  const button = document.createElement('button');
  button.className = 'fgp-share-to-groups-btn';
  button.setAttribute('data-testid', 'fgp-share-to-groups-messenger');
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: linear-gradient(135deg, #0084ff, #0066cc);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 132, 255, 0.3);
    z-index: 1000;
  `;
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="9" x2="21" y2="3"></line>
    </svg>
    Share to Groups
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

  const groups = await getMessengerGroups();
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

async function getMessengerGroups(): Promise<Array<{ id: string; name: string }>> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_MESSENGER_GROUPS' }, response => {
      const groups = response?.success ? response.data : null;
      resolve(Array.isArray(groups) ? groups : []);
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
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Share to Messenger Groups</h2>
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
      Select groups to share this message to.
    </p>
    <div class="fgp-group-search" style="margin-bottom: 16px;">
      <input type="text" placeholder="Search groups..." style="
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
          ? '<p style="text-align: center; padding: 20px; opacity: 0.6;">No Messenger groups synced yet. Open Messenger and click "Sync Groups" in extension options.</p>'
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
              <input type="checkbox" value="${escapeHtml(g.id)}" style="width: 18px; height: 18px; accent-color: #0084ff;">
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
      <button class="fgp-share-btn" style="
        padding: 10px 20px;
        border: none;
        background: linear-gradient(135deg, #0084ff, #0066cc);
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      ">Share to Selected</button>
    </div>
  `;

  overlay.appendChild(sheet);

  overlay.querySelector('.fgp-close-btn')?.addEventListener('click', closeShareSheet);
  overlay.querySelector('.fgp-cancel-btn')?.addEventListener('click', closeShareSheet);
  overlay.querySelector('.fgp-share-btn')?.addEventListener('click', () => shareToSelected(sheet));

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeShareSheet();
  });

  return overlay;
}

async function shareToSelected(sheet: HTMLElement): Promise<void> {
  const checkboxes = sheet.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);

  if (selectedIds.length === 0) {
    alert('Please select at least one group');
    return;
  }

  closeShareSheet();

  const messageData = await getMessageData();
  if (!messageData) {
    alert('Could not find message to share');
    return;
  }

  for (const groupId of selectedIds) {
    try {
      await shareMessage(groupId, messageData);
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.error('Failed to share:', error);
      alert(
        `Failed to share to ${groupId}: ${error instanceof Error ? error.message : 'Unknown error'}`
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

async function shareMessage(
  groupId: string,
  messageData: { text?: string; media?: boolean }
): Promise<void> {
  const groupName = groupId.replace('ms_', '').replace(/_/g, ' ');

  const chatElement = await findChatByName(groupName);
  if (!chatElement) {
    throw new Error(`Group "${groupName}" not found in chat list`);
  }

  chatElement.click();
  await sleep(1000);

  const messageInput = await findMessageInput();
  if (!messageInput) {
    throw new Error('Message input not found');
  }

  if (messageData.text) {
    await typeMessage(messageInput, messageData.text);
    await sleep(300);
  }

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

    const observer = new MutationObserver(() => {
      search();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 10000);
  });
}

function findMessageInput(): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const search = () => {
      const selectors = [
        '[contenteditable="true"][data-testid="composer-input"]',
        '[contenteditable="true"][aria-label*="Message" i]',
        'div[contenteditable="true"][role="textbox"]',
        '[data-testid="composer-input"]',
        'div[contenteditable="true"]',
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

  input.textContent = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(50);

  input.textContent = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(100);
}

function findSendButton(): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const search = () => {
      const selectors = [
        '[data-testid="composer-send-button"]',
        'button[aria-label="Send"]',
        'div[aria-label="Send"]',
        'button:has(svg[data-icon="send"])',
        '[data-testid="send-button"]',
        'div[role="button"][aria-label="Send"]',
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

// Keep this content script's declarations scoped to its own bundle.
export {};
