/**
 * Share Executor
 * Executes the actual share action in the content script context
 */

import { logger } from '../shared/logger';
import type { ShareSettings } from '../shared/types';

export async function performShareInContentScript(
  postUrl: string,
  groupId: string,
  groupName: string,
  settings: ShareSettings
): Promise<{ success: boolean; error?: string; anomaly?: import('../shared/types').Anomaly }> {
  return new Promise(resolve => {
    // Find a Facebook tab
    chrome.tabs.query({ url: '*://*.facebook.com/*' }, tabs => {
      const tab = tabs.find(t => t.url?.includes('facebook.com'));
      if (!tab || !tab.id) {
        resolve({ success: false, error: 'No Facebook tab found' });
        return;
      }

      // First navigate to the post if needed
      chrome.tabs.update(tab.id, { url: postUrl }, updatedTab => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        // Facebook's SPA needs a few seconds to paint the post before its action bar
        // (and the share control in it) exists.
        setTimeout(() => {
          executeShareInTab(updatedTab!.id!, groupId, groupName, settings).then(resolve);
        }, 7000);
      });
    });
  });
}

async function executeShareInTab(
  tabId: number,
  groupId: string,
  groupName: string,
  settings: ShareSettings
): Promise<{ success: boolean; error?: string; anomaly?: import('../shared/types').Anomaly }> {
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: performShareAutomation,
        args: [groupId, groupName, settings],
      },
      results => {
        if (chrome.runtime.lastError) {
          logger.error('background', 'Script injection failed', {
            error: chrome.runtime.lastError.message,
          });
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        const result = results?.[0]?.result;
        if (result?.success) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: result?.error || 'Share failed',
            anomaly: result?.anomaly,
          });
        }
      }
    );
  });
}

function performShareAutomation(
  groupId: string,
  groupName: string,
  settings: ShareSettings
): { success: boolean; error?: string; anomaly?: import('../shared/types').Anomaly } {
  try {
    // This function runs in the content script context
    // It will be injected via executeScript

    // Step 1: Find and click share button (poll: the feed paints late)
    let shareButton = findShareButton();
    for (let wait = 0; !shareButton && wait < 5000; wait += 250) {
      sleep(250);
      shareButton = findShareButton();
    }
    if (!shareButton) {
      return { success: false, error: 'Share button not found' };
    }
    shareButton.click();

    // Step 2: Wait for share dialog
    const shareDialog = waitForShareDialog(3000);
    if (!shareDialog) {
      return { success: false, error: 'Share dialog did not open' };
    }

    // Step 3: Check for anomalies
    const anomaly = detectAnomaly(document);
    if (anomaly && !anomaly.recoverable) {
      return { success: false, error: `Anomaly: ${anomaly.message}`, anomaly };
    }

    // Step 4: open the "Group" destination, then pick the group by name.
    // Facebook shows two share-dialog variants:
    //   1) Group picker (has "Group" destination tiles we can select)
    //   2) Link-share dialog (no Group tiles; shares the URL as a link)
    // We detect which variant is active and only proceed with Group posting when
    // the Group destination is present; otherwise we abort gracefully.
    const shareTerms = ['share', 'compartir', 'partager', 'teilen'];
    let dialog: HTMLElement = shareDialog;
    let groupInput = findGroupInput(dialog);
    if (!groupInput) {
      // Try to find a “Group” destination tile inside the dialog.
      let groupDestination = findElementByOwnText(dialog, 'group');
      for (let wait = 0; !groupDestination && wait < 4000; wait += 250) {
        sleep(250);
        groupDestination = findElementByOwnText(
          findDialogContaining(shareTerms) ?? dialog,
          'group'
        );
      }
      if (!groupDestination) {
        // Group tile not present – this dialog variant does not support Group posting.
        // Do NOT fire a link-share against the user's groups (hard-to-undo).
        const seen = (dialog.textContent || '').replace(/\s+/g, ' ').slice(0, 120);
        return {
          success: false,
          error: `Share dialog has no Group destination (dialog: ${seen}); Group posting not supported in this dialog variant`,
          anomaly: {
            type: 'unsupported-variant',
            message: 'Share dialog lacks Group tiles',
            recoverable: false,
          },
        };
      }
      groupDestination.click();
      sleep(1500);
      dialog = findDialogContaining(shareTerms) ?? dialog;
      groupInput = findGroupInput(dialog);
    }
    if (!groupInput) return { success: false, error: 'Group picker not found' };

    setInputValue(groupInput, groupName);
    sleep(1500);
    dialog = findDialogContaining(shareTerms) ?? dialog;
    const groupRow = findGroupRow(dialog, groupName);
    if (!groupRow) {
      return { success: false, error: `Group "${groupName}" is not offered in the share dialog` };
    }
    groupRow.click();
    void groupId;

    // Step 5: Wait for group selection
    sleep(900);

    // Step 6: Set caption if provided
    if (settings.caption) {
      const captionInput = findCaptionInput(shareDialog);
      if (captionInput) {
        if (captionInput.tagName === 'TEXTAREA') {
          (captionInput as HTMLTextAreaElement).value = settings.caption;
        } else {
          captionInput.textContent = settings.caption;
        }
        captionInput.dispatchEvent(new Event('input', { bubbles: true }));
        sleep(300);
      }
    }

    // Step 7: Set first comment if provided
    if (settings.firstComment) {
      const commentInput = findFirstCommentInput(shareDialog);
      if (commentInput) {
        commentInput.value = settings.firstComment;
        commentInput.dispatchEvent(new Event('input', { bubbles: true }));
        sleep(300);
      }
    }

    // Step 8: Find and click post button
    const postButton = findPostButton(shareDialog);
    if (!postButton) {
      return { success: false, error: 'Post button not found' };
    }
    postButton.click();
    sleep(1500);

    // Step 9: Verify success
    const verified = verifyShareSuccess();
    if (!verified) {
      return { success: false, error: 'Share verification failed' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }

  function findShareButton(): HTMLElement | null {
    const selectors = [
      '[data-testid="share-button"]',
      '[role="button"][aria-label*="Share" i]',
      '[role="button"][aria-label*="Compartir" i]',
      '[role="button"][aria-label*="Partager" i]',
      '[role="button"][aria-label*="Teilen" i]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el && isVisible(el)) return el;
    }
    // Current Facebook renders the action as an unlabelled role=button whose only
    // text is "Share".
    const buttons = document.querySelectorAll<HTMLElement>('div[role="button"]');
    for (const el of buttons) {
      if (isVisible(el) && (el.textContent || '').trim().toLowerCase() === 'share') return el;
    }
    return null;
  }

  // CSS cannot express "dialog whose text says Share" (the `:has-text` helper is a test
  // framework extension and throws in querySelector), so match on text here.
  function findDialogContaining(terms: string[]): HTMLElement | null {
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"], [data-testid="share-dialog"]')
    ).filter(dialog => isVisible(dialog));
    // Facebook stacks overlays; the newest (last) one is the share sheet on top.
    for (let i = dialogs.length - 1; i >= 0; i--) {
      const text = (dialogs[i].textContent || '').toLowerCase();
      if (terms.some(term => text.includes(term))) return dialogs[i];
    }
    return null;
  }

  function waitForShareDialog(maxWait: number): HTMLElement | null {
    const terms = ['share', 'compartir', 'partager', 'teilen'];
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const dialog = findDialogContaining(terms);
      if (dialog) return dialog;
      sleep(100);
    }
    return null;
  }

  // The "Share to" tiles carry no role or aria-label; the visible label is the only
  // handle, and clicking the deepest node still bubbles to Facebook's handler.
  function findElementByOwnText(root: Element, label: string): HTMLElement | null {
    const target = label.toLowerCase();
    const nodes = root.querySelectorAll<HTMLElement>(
      'span, div, a, [role="link"], [role="button"]'
    );
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const own = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => (node.textContent || '').trim())
        .join('');
      if (own.toLowerCase() === target) return el;
    }
    return null;
  }

  // Facebook's picker is React-controlled, so assigning `.value` is ignored; go through
  // the native setter and fire the same event a real keystroke would.
  function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findGroupRow(dialog: Element, name: string): HTMLElement | null {
    const target = name.replace(/\s+/g, ' ').trim().toLowerCase();
    const rows = dialog.querySelectorAll<HTMLElement>(
      '[role="listitem"], [role="option"], [role="button"]'
    );
    for (const row of rows) {
      if (!isVisible(row)) continue;
      const text = (row.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text === target || text.startsWith(target)) return row;
    }
    return null;
  }

  function findGroupInput(dialog: Element): HTMLInputElement | null {
    const selectors = [
      'input[role="combobox"]',
      'input[placeholder*="group" i]',
      'input[aria-label*="group" i]',
      'input[data-testid*="group" i]',
      'input[placeholder*="grupo" i]',
      'input[placeholder*="groupe" i]',
    ];
    for (const sel of selectors) {
      const el = dialog.querySelector(sel) as HTMLInputElement;
      if (el && isVisible(el) && !el.disabled && !el.readOnly) return el;
    }
    return null;
  }

  function findCaptionInput(dialog: Element): HTMLElement | null {
    const selectors = [
      'textarea[placeholder*="say" i]',
      'textarea[placeholder*="escribe" i]',
      'textarea[placeholder*="écris" i]',
      '[contenteditable="true"][role="textbox"]',
    ];
    for (const sel of selectors) {
      const el = dialog.querySelector(sel) as HTMLElement;
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function findFirstCommentInput(dialog: Element): HTMLTextAreaElement | null {
    const selectors = [
      'textarea[placeholder*="comment" i]',
      'textarea[placeholder*="comentario" i]',
      'textarea[placeholder*="commentaire" i]',
    ];
    for (const sel of selectors) {
      const el = dialog.querySelector(sel) as HTMLTextAreaElement;
      if (el && isVisible(el) && !el.disabled && !el.readOnly) return el;
    }
    return null;
  }

  function findPostButton(dialog: Element): HTMLElement | null {
    const labels = ['post', 'share now', 'share', 'publicar', 'partager', 'posten'];
    const candidates = dialog.querySelectorAll<HTMLElement>('[role="button"], button');
    for (const el of candidates) {
      if (
        !isVisible(el) ||
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true'
      ) {
        continue;
      }
      const label = (el.textContent || '').trim().toLowerCase();
      if (labels.includes(label)) return el;
    }
    return null;
  }

  function verifyShareSuccess(): boolean {
    const dialog = findDialogContaining(['share', 'compartir', 'partager', 'teilen']);
    if (dialog) {
      // Still open: a visible error inside means the share failed, otherwise it is
      // probably still submitting, which we cannot call a success either.
      return false;
    }
    // Dialog closed - likely success
    return true;
  }

  function detectAnomaly(doc: Document = document): import('../shared/types').Anomaly | null {
    // Simplified anomaly detection for inline execution
    const anomalySelectors: Record<import('../shared/types').AnomalyType, string[]> = {
      captcha: ['iframe[src*="captcha" i]', 'div[id*="captcha" i]'],
      checkpoint: [':has-text("Checkpoint" i)', ':has-text("Verify your identity" i)'],
      'rate-limit': [':has-text("temporarily blocked" i)', ':has-text("too many" i)'],
    };

    for (const [type, selectors] of Object.entries(anomalySelectors)) {
      for (const sel of selectors) {
        if (sel.includes(':has-text(')) {
          const match = sel.match(/:has-text\("([^"]+)"\s*i?\)/);
          if (match) {
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent?.toLowerCase().includes(match[1].toLowerCase())) continue;
              // Post bodies and comments often mention these words; only a banner
              // outside the feed is an actual block.
              if (node.parentElement?.closest('[role="article"], [role="feed"]')) continue;
              if (!node.parentElement || !isVisible(node.parentElement)) continue;
              return {
                type,
                message: `Detected ${type}`,
                recoverable: type !== 'captcha' && type !== 'checkpoint',
              };
            }
          }
        } else {
          const els = doc.querySelectorAll(sel);
          if (els.length > 0) {
            for (const el of els)
              if (isVisible(el)) {
                return {
                  type,
                  message: `Detected ${type}`,
                  recoverable: type !== 'captcha' && type !== 'checkpoint',
                };
              }
          }
        }
      }
    }
    return null;
  }

  function isVisible(el: Element): boolean {
    const style = getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  function sleep(ms: number): void {
    // Busy wait for inline execution
    const start = Date.now();
    while (Date.now() - start < ms) {
      /* wait */
    }
  }
}
