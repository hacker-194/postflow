/**
 * Button Injector
 * Finds Facebook's native share button and injects our "Share to Groups" button
 */

import { logger } from '../shared/logger';
import { DEFAULT_USER_SETTINGS } from '../shared/constants';
import type { UserSettings } from '../shared/types';
import { extractPostPreviewSync } from './fb-adapter/extract-post';
import { mountShareSheet } from './share-sheet-host';

let observer: MutationObserver | null = null;

export function initializeButtonInjector(): void {
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
  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        checkForShareButtons();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Facebook's share action no longer carries data-testid or an aria-label: it is an
 * unlabelled role=button whose only text is "Share". Match on the text as well.
 */
function findNativeShareButtons(): HTMLElement[] {
  const buttons = new Set<HTMLElement>();
  const selectors = ['[data-testid="share-button"]', '[role="button"][aria-label*="Share" i]'];
  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach(el => buttons.add(el));
  }
  document.querySelectorAll<HTMLElement>('div[role="button"]').forEach(el => {
    if ((el.textContent || '').trim().toLowerCase() === 'share') buttons.add(el);
  });
  return Array.from(buttons);
}

let injectScheduled = false;

function checkForShareButtons(): void {
  // Posts load continuously (infinite scroll), so keep looking instead of injecting once.
  // Debounced because the observer fires on every DOM mutation Facebook makes.
  if (injectScheduled) return;
  injectScheduled = true;
  window.setTimeout(() => {
    injectScheduled = false;
    void injectShareButton();
  }, 600);
}

async function injectShareButton(): Promise<void> {
  // Settings live in the extension's IndexedDB; a content script only sees the
  // page's storage, so ask the background instead.
  const response = await chrome.runtime
    .sendMessage({ type: 'GET_USER_SETTINGS' })
    .catch(() => null);
  const userSettings: UserSettings = response?.data ?? DEFAULT_USER_SETTINGS;
  console.log('[FGP] injectShareButton userSettings:', JSON.stringify(userSettings));
  if (!userSettings.showShareButton) return;

  const shareButtons = findNativeShareButtons();
  for (const btn of shareButtons) {
    if (btn.parentElement?.querySelector('.fgp-share-to-groups-btn')) continue;

    const fgpButton = createShareButton();
    const position = userSettings.shareButtonPosition;
    console.log('[FGP] Position:', position);

    if (position === 'after_share') {
      btn.parentElement?.insertBefore(fgpButton, btn.nextSibling);
    } else if (position === 'before_share') {
      btn.parentElement?.insertBefore(fgpButton, btn);
    } else if (position === 'floating') {
      console.log('[FGP] Applying floating styles');
      document.body.appendChild(fgpButton);
      fgpButton.style.setProperty('position', 'fixed', 'important');
      fgpButton.style.setProperty('bottom', '24px', 'important');
      fgpButton.style.setProperty('right', '24px', 'important');
      fgpButton.style.setProperty('z-index', '2147483647', 'important');
      fgpButton.classList.add('fgp-floating');
      console.log('[FGP] After floating styles, style:', fgpButton.getAttribute('style'));
    }
  }
}

function createShareButton(): HTMLElement {
  const button = document.createElement('button');
  button.className = 'fgp-share-to-groups-btn';
  button.setAttribute('data-testid', 'fgp-share-to-groups');
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: linear-gradient(135deg, #1877f2, #0d65d9);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(24, 119, 242, 0.3);
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

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 4px 8px rgba(24, 119, 242, 0.4)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 2px 4px rgba(24, 119, 242, 0.3)';
  });

  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    // Comments are articles nested inside the post's article; walk up to the outermost
    // one or the preview ends up describing a comment instead of the post.
    let postContainer = button.closest(
      '[role="article"], [data-pagelet*="FeedUnit"], .x1yztbdb'
    ) as HTMLElement | null;
    while (postContainer && postContainer.parentElement?.closest('[role="article"]')) {
      postContainer = postContainer.parentElement.closest('[role="article"]') as HTMLElement;
    }
    openShareSheet(postContainer);
  });

  return button;
}

function openShareSheet(postContainer: HTMLElement | null): void {
  const preview = extractPostPreviewSync(postContainer);
  if (!preview) {
    logger.warn('content', 'Could not extract post preview');
    return;
  }
  void mountShareSheet(preview);
}

export function destroyButtonInjector(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  const buttons = document.querySelectorAll('.fgp-share-to-groups-btn');
  buttons.forEach(btn => btn.remove());
}
