import { logger } from '../shared/logger';
import type { PostPreview, ShareSettings } from '../shared/types';
import {
  sanitizeCaption,
  sanitizeComment,
  sanitizeSettings,
  sanitizeHtml,
} from '../shared/security';

logger.info('content', 'Content script loaded');

let shareButtonInjected = false;
let shareSheetInjected = false;
let observer: MutationObserver | null = null;

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
  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        checkForShareButtons();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function checkForShareButtons(): void {
  const shareButtons = document.querySelectorAll(
    '[data-testid="share-button"], [aria-label*="Share" i], [role="button"]:has-text("Share")'
  );
  if (shareButtons.length > 0 && !shareButtonInjected) {
    injectShareButton();
  }
}

async function injectShareButton(): Promise<void> {
  const userSettings = await getUserSettings();
  if (!userSettings.showShareButton) return;

  const shareButtons = document.querySelectorAll('[data-testid="share-button"]');
  for (const btn of shareButtons) {
    if (btn.parentElement?.querySelector('.fgp-share-to-groups-btn')) continue;

    const fgpButton = createShareButton();
    const position = userSettings.shareButtonPosition;

    if (position === 'after_share') {
      btn.parentElement?.insertBefore(fgpButton, btn.nextSibling);
    } else if (position === 'before_share') {
      btn.parentElement?.insertBefore(fgpButton, btn);
    }
    shareButtonInjected = true;
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
    openShareSheet(
      button.closest('[role="article"], [data-pagelet*="FeedUnit"], .x1yztbdb') as HTMLElement
    );
  });

  return button;
}

async function getUserSettings(): Promise<{
  showShareButton: boolean;
  shareButtonPosition: string;
}> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }, response => {
      resolve(response || { showShareButton: true, shareButtonPosition: 'after_share' });
    });
  });
}

function openShareSheet(postContainer: HTMLElement | null): void {
  if (shareSheetInjected) return;

  const preview = extractPostPreview(postContainer);
  if (!preview) {
    logger.warn('content', 'Could not extract post preview');
    return;
  }

  const sheet = createShareSheet(preview);
  document.body.appendChild(sheet);
  shareSheetInjected = true;

  requestAnimationFrame(() => {
    sheet.classList.add('fgp-visible');
  });
}

function extractPostPreview(container: HTMLElement | null): PostPreview | null {
  const root = container || document;

  const authorLink = root.querySelector(
    'a[href*="/user/"], a[href*="/profile/"]'
  ) as HTMLAnchorElement;
  const authorName =
    authorLink?.textContent?.trim() ||
    root.querySelector('[role="heading"] strong, strong.x1lliihq')?.textContent?.trim();
  const authorProfileUrl = authorLink?.href || '';

  const textSelectors = [
    '[data-testid="post_message"]',
    '[data-ad-comet-preview="message"]',
    '.x1iorvi4',
    '.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.xvs91rp.x1s688f.x5n08af.x10wh9bi.x1wdrske.x1c4vz4f.x2lah0s.x1q0g3np.x1a2a7pz.x1nhvcw1',
  ];
  let text = '';
  for (const sel of textSelectors) {
    const el = root.querySelector(sel);
    if (el?.textContent?.trim()) {
      text = el.textContent.trim();
      break;
    }
  }

  const images: string[] = [];
  root.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').forEach(img => {
    const src = (img as HTMLImageElement).src;
    if (src && !src.includes('profile') && !src.includes('emoji') && src.length > 50) {
      images.push(src);
    }
  });

  let videoUrl: string | undefined;
  let isVideo = false;
  let isReel = false;
  const video = root.querySelector('video') as HTMLVideoElement;
  if (video?.src) {
    videoUrl = video.src;
    isVideo = true;
    isReel = root.querySelector('[href*="/reel/"]') !== null;
  }

  const postLink = root.querySelector(
    'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]'
  ) as HTMLAnchorElement;
  const url = postLink?.href || window.location.href;

  return {
    url,
    authorName: authorName || 'Unknown',
    authorProfileUrl,
    text,
    images,
    videoUrl,
    isReel,
    isVideo,
    postedAt: Date.now(),
  };
}

function createShareSheet(preview: PostPreview): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'fgp-share-sheet-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;

  const sheet = document.createElement('div');
  sheet.className = 'fgp-share-sheet';
  sheet.style.cssText = `
    background: white;
    border-radius: 16px;
    width: 90%;
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    transform: scale(0.95);
    transition: transform 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  overlay.appendChild(sheet);

  sheet.innerHTML = `
    <div class="fgp-sheet-header" style="padding: 16px 20px; border-bottom: 1px solid #e4e6eb; display: flex; align-items: center; justify-content: space-between;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #050505;">Share to Groups</h2>
      <button class="fgp-close-btn" style="background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: #65676b;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="fgp-sheet-content" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
      <div class="fgp-post-preview" style="background: #f0f2f5; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <img src="${preview.authorProfileUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ddd%22/></svg>'}"
               alt="" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
          <div>
            <div style="font-weight: 600; font-size: 15px; color: #050505;">${escapeHtml(preview.authorName)}</div>
            <div style="font-size: 12px; color: #65676b;">Original post</div>
          </div>
        </div>
        ${preview.text ? `<div style="font-size: 14px; color: #050505; line-height: 1.5; margin-bottom: 12px;">${escapeHtml(preview.text.slice(0, 300))}${preview.text.length > 300 ? '...' : ''}</div>` : ''}
        ${
          preview.images.length > 0
            ? `
          <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px;">
            ${preview.images
              .slice(0, 4)
              .map(
                img =>
                  `<img src="${img}" alt="" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; flex-shrink: 0;">`
              )
              .join('')}
            ${preview.images.length > 4 ? `<div style="width: 80px; height: 80px; border-radius: 8px; background: #e4e6eb; display: flex; align-items: center; justify-content: center; color: #65676b; font-size: 12px; flex-shrink: 0;">+${preview.images.length - 4}</div>` : ''}
          </div>
        `
            : ''
        }
        ${preview.videoUrl ? `<div style="color: #1877f2; font-size: 13px; margin-top: 8px;">🎬 ${preview.isReel ? 'Reel' : 'Video'} attached</div>` : ''}
      </div>

      <div class="fgp-share-mode" style="margin-bottom: 20px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #050505; margin-bottom: 12px;">How to share</label>
        <div style="display: flex; gap: 8px;">
          <button class="fgp-mode-btn fgp-active" data-mode="share_original" style="flex: 1; padding: 12px; border: 2px solid #1877f2; border-radius: 10px; background: #e7f3ff; color: #1877f2; font-weight: 600; cursor: pointer;">
            <div style="font-size: 14px;">Share the post</div>
            <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Keeps author & video</div>
          </button>
          <button class="fgp-mode-btn" data-mode="repost_content" style="flex: 1; padding: 12px; border: 2px solid #e4e6eb; border-radius: 10px; background: white; color: #050505; font-weight: 600; cursor: pointer;">
            <div style="font-size: 14px;">Post as me</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">New post from you</div>
          </button>
        </div>
      </div>

      <div class="fgp-caption" style="margin-bottom: 20px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #050505; margin-bottom: 8px;">Add a caption (optional)</label>
        <textarea class="fgp-caption-input" placeholder="What's on your mind? Use {option1|option2} for Spintax..." style="width: 100%; min-height: 80px; padding: 12px; border: 2px solid #e4e6eb; border-radius: 10px; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="fgp-spintax-btn" style="padding: 6px 12px; border: 1px solid #e4e6eb; border-radius: 6px; background: white; font-size: 12px; color: #65676b; cursor: pointer;">Insert Spintax</button>
          <button class="fgp-template-btn" style="padding: 6px 12px; border: 1px solid #e4e6eb; border-radius: 6px; background: white; font-size: 12px; color: #65676b; cursor: pointer;">Use Template</button>
        </div>
      </div>

      <div class="fgp-first-comment" style="margin-bottom: 20px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #050505; margin-bottom: 8px;">First comment (optional)</label>
        <textarea class="fgp-comment-input" placeholder="First comment to post..." style="width: 100%; min-height: 60px; padding: 12px; border: 2px solid #e4e6eb; border-radius: 10px; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
      </div>

      <div class="fgp-group-selector" style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <label style="font-size: 14px; font-weight: 600; color: #050505;">Select Groups</label>
          <span class="fgp-group-count" style="font-size: 13px; color: #65676b;">0 groups selected</span>
        </div>
        <div class="fgp-group-lists" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;"></div>
        <div class="fgp-group-search" style="margin-bottom: 12px;">
          <input type="text" placeholder="Search groups..." style="width: 100%; padding: 10px 12px; border: 2px solid #e4e6eb; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
        </div>
        <div class="fgp-group-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #e4e6eb; border-radius: 8px;"></div>
      </div>

      <div class="fgp-advanced-settings" style="border-top: 1px solid #e4e6eb; padding-top: 16px;">
        <details style="margin-bottom: 16px;">
          <summary style="font-size: 14px; font-weight: 600; color: #050505; cursor: pointer;">Sending Settings</summary>
          <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 16px;">
            <div>
              <label style="font-size: 13px; font-weight: 500; color: #050505;">Safety Level</label>
              <div style="display: flex; gap: 8px; margin-top: 8px;">
                <label style="flex: 1; padding: 10px; border: 2px solid #e4e6eb; border-radius: 8px; cursor: pointer; text-align: center;">
                  <input type="radio" name="fgp-safety" value="fast" style="display: none;"> Fast
                </label>
                <label style="flex: 1; padding: 10px; border: 2px solid #1877f2; border-radius: 8px; cursor: pointer; text-align: center; background: #e7f3ff; color: #1877f2;">
                  <input type="radio" name="fgp-safety" value="balanced" checked style="display: none;"> Balanced
                </label>
                <label style="flex: 1; padding: 10px; border: 2px solid #e4e6eb; border-radius: 8px; cursor: pointer; text-align: center;">
                  <input type="radio" name="fgp-safety" value="safe" style="display: none;"> Safe
                </label>
              </div>
            </div>
            <div>
              <label style="font-size: 13px; font-weight: 500; color: #050505;">Overnight Pause</label>
              <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" class="fgp-overnight" checked> Enable
                </label>
                <span style="color: #65676b; font-size: 13px;">From</span>
                <input type="time" class="fgp-overnight-start" value="22:00" style="padding: 6px 10px; border: 1px solid #e4e6eb; border-radius: 6px;">
                <span style="color: #65676b; font-size: 13px;">to</span>
                <input type="time" class="fgp-overnight-end" value="07:00" style="padding: 6px 10px; border: 1px solid #e4e6eb; border-radius: 6px;">
              </div>
            </div>
            <div>
              <label style="font-size: 13px; font-weight: 500; color: #050505;">Daily Limit</label>
              <input type="number" class="fgp-daily-limit" value="200" min="1" max="500" style="margin-top: 8px; padding: 10px; border: 2px solid #e4e6eb; border-radius: 8px; width: 100px;">
            </div>
          </div>
        </details>
      </div>
    </div>
    <div class="fgp-sheet-footer" style="padding: 16px 20px; border-top: 1px solid #e4e6eb; display: flex; gap: 12px; justify-content: flex-end;">
      <button class="fgp-cancel-btn" style="padding: 10px 20px; border: 1px solid #e4e6eb; border-radius: 8px; background: white; color: #050505; font-weight: 600; cursor: pointer;">Cancel</button>
      <button class="fgp-schedule-btn" style="padding: 10px 20px; border: none; border-radius: 8px; background: #f0f2f5; color: #050505; font-weight: 600; cursor: pointer;">Schedule</button>
      <button class="fgp-share-now-btn" style="padding: 10px 20px; border: none; border-radius: 8px; background: linear-gradient(135deg, #1877f2, #0d65d9); color: white; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(24, 119, 242, 0.3);">Share Now</button>
    </div>
  `;

  setupSheetEvents(sheet, preview);

  return overlay;
}

async function loadGroupLists(overlay: HTMLElement): Promise<void> {
  const lists = await getGroupLists();
  const container = overlay.querySelector('.fgp-group-lists');
  if (!container) return;

  container.innerHTML = lists
    .map(
      list => `
    <button class="fgp-list-btn" data-list-id="${list.id}" style="padding: 8px 12px; border: 2px solid ${list.color}; border-radius: 8px; background: white; color: ${list.color}; font-weight: 600; cursor: pointer;">
      ${list.name} (${list.groupIds.length})
    </button>
  `
    )
    .join('');

  container.querySelectorAll('.fgp-list-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const listId = btn.getAttribute('data-list-id');
      if (!listId) return;

      container.querySelectorAll('.fgp-list-btn').forEach(b => {
        const el = b as HTMLElement;
        el.style.background = 'white';
        el.style.color = el.style.borderColor;
      });
      const btnEl = btn as HTMLElement;
      btnEl.style.background = btnEl.style.borderColor;
      btnEl.style.color = 'white';

      const groups = await getGroupsForList(listId);
      const groupListContainer = overlay.querySelector('.fgp-group-list');
      if (groupListContainer) {
        groupListContainer.innerHTML = groups
          .map(
            g => `
          <label class="fgp-checkbox-label" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f2f5;">
            <input type="checkbox" class="fgp-group-checkbox" data-group-id="${g.id}" data-group-name="${g.name}">
            <span>${g.name}</span>
          </label>
        `
          )
          .join('');
      }
    });
  });

  if (lists.length > 0) {
    const firstBtn = container.querySelector('.fgp-list-btn') as HTMLElement;
    firstBtn?.click();
  }
}

function setupSheetEvents(sheet: HTMLElement, preview: PostPreview): void {
  const overlay = sheet.parentElement!;

  overlay.querySelector('.fgp-close-btn')?.addEventListener('click', closeSheet);
  overlay.querySelector('.fgp-cancel-btn')?.addEventListener('click', closeSheet);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSheet();
  });

  const modeButtons = overlay.querySelectorAll('.fgp-mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => {
        b.classList.remove('fgp-active');
        (b as HTMLElement).style.borderColor = '#e4e6eb';
        (b as HTMLElement).style.background = 'white';
        (b as HTMLElement).style.color = '#050505';
      });
      btn.classList.add('fgp-active');
      (btn as HTMLElement).style.borderColor = '#1877f2';
      (btn as HTMLElement).style.background = '#e7f3ff';
      (btn as HTMLElement).style.color = '#1877f2';
    });
  });

  const shareNowBtn = overlay.querySelector('.fgp-share-now-btn');
  shareNowBtn?.addEventListener('click', async () => {
    const settings = collectSettings(overlay);
    const groups = collectSelectedGroups(overlay);

    if (groups.length === 0) {
      alert('Please select at least one group');
      return;
    }

    await startSharing(preview, groups, settings);
    closeSheet();
  });

  const scheduleBtn = overlay.querySelector('.fgp-schedule-btn');
  scheduleBtn?.addEventListener('click', async () => {
    const settings = collectSettings(overlay);
    const groups = collectSelectedGroups(overlay);

    if (groups.length === 0) {
      alert('Please select at least one group');
      return;
    }

    const scheduledAt = await promptForScheduleTime();
    if (!scheduledAt) return;

    await scheduleSharing(preview, groups, settings, scheduledAt);
    closeSheet();
  });

  loadGroupLists(overlay);
}

function collectSettings(overlay: HTMLElement): ShareSettings {
  const modeBtn = overlay.querySelector('.fgp-mode-btn.fgp-active') as HTMLElement;
  const caption = (overlay.querySelector('.fgp-caption-input') as HTMLTextAreaElement).value;
  const firstComment = (overlay.querySelector('.fgp-comment-input') as HTMLTextAreaElement).value;
  const safetyLevel =
    ((overlay.querySelector('input[name="fgp-safety"]:checked') as HTMLInputElement)?.value as
      'fast' | 'balanced' | 'safe') || 'balanced';
  const overnightPause = (overlay.querySelector('.fgp-overnight') as HTMLInputElement).checked;
  const overnightStart = (overlay.querySelector('.fgp-overnight-start') as HTMLInputElement).value;
  const overnightEnd = (overlay.querySelector('.fgp-overnight-end') as HTMLInputElement).value;
  const maxPostsPerDay =
    parseInt((overlay.querySelector('.fgp-daily-limit') as HTMLInputElement).value) || 200;

  const rawSettings = {
    mode: (modeBtn?.dataset.mode as ShareSettings['mode']) || 'share_original',
    caption: sanitizeCaption(caption),
    firstComment: sanitizeComment(firstComment),
    useSpintax: caption.includes('{') && caption.includes('|'),
    delayBetweenGroups: 30000,
    safetyLevel,
    overnightPause,
    overnightStart,
    overnightEnd,
    maxPostsPerDay,
  };

  return sanitizeSettings(rawSettings);
}

function collectSelectedGroups(overlay: HTMLElement): Array<{ id: string; name: string }> {
  const checkboxes = overlay.querySelectorAll('.fgp-group-checkbox:checked');
  return Array.from(checkboxes).map(cb => ({
    id: (cb as HTMLInputElement).dataset.groupId!,
    name: (cb as HTMLInputElement).dataset.groupName!,
  }));
}

async function startSharing(
  preview: PostPreview,
  groups: Array<{ id: string; name: string }>,
  settings: ShareSettings
): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'SCHEDULE_SHARE',
    payload: {
      postUrl: preview.url,
      postPreview: preview,
      groupListId: 'manual',
      settings,
      scheduledAt: Date.now(),
    },
  });

  if (result.success) {
    showToast(`Sharing started to ${groups.length} groups...`);
  } else {
    showToast('Failed to start sharing: ' + (result.error || 'Unknown error'));
  }
}

async function scheduleSharing(
  preview: PostPreview,
  groups: Array<{ id: string; name: string }>,
  settings: ShareSettings,
  scheduledAt: number
): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'SCHEDULE_SHARE',
    payload: {
      postUrl: preview.url,
      postPreview: preview,
      groupListId: 'manual',
      settings,
      scheduledAt,
    },
  });

  if (result.success) {
    showToast(`Scheduled for ${new Date(scheduledAt).toLocaleString()}`);
  } else {
    showToast('Failed to schedule: ' + (result.error || 'Unknown error'));
  }
}

function promptForScheduleTime(): Promise<number | null> {
  return new Promise(resolve => {
    const input = prompt('Enter date/time (YYYY-MM-DD HH:MM) or "in X minutes/hours":');
    if (!input) return resolve(null);

    if (input.startsWith('in ')) {
      const match = input.match(/in (\d+) (minute|hour)s?/i);
      if (match && match[1] && match[2]) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = unit === 'minute' ? value * 60 * 1000 : value * 60 * 60 * 1000;
        resolve(Date.now() + ms);
        return;
      }
    }

    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      resolve(date.getTime());
    } else {
      alert('Invalid format. Use YYYY-MM-DD HH:MM or "in X minutes"');
      resolve(null);
    }
  });
}

function closeSheet(): void {
  const overlay = document.querySelector('.fgp-share-sheet-overlay');
  if (overlay) {
    (overlay as HTMLElement).style.opacity = '0';
    const sheet = overlay.querySelector('.fgp-share-sheet') as HTMLElement;
    if (sheet) sheet.style.transform = 'scale(0.95)';
    setTimeout(() => overlay.remove(), 200);
    shareSheetInjected = false;
  }
}

function showToast(message: string): void {
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

async function getGroupLists(): Promise<
  Array<{ id: string; name: string; groupIds: string[]; color: string }>
> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' }, response => {
      resolve(response || []);
    });
  });
}

async function getGroupsForList(listId: string): Promise<Array<{ id: string; name: string }>> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_GROUPS_FOR_LIST', listId }, response => {
      resolve(response || []);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERFORM_SHARE') {
    performShare(message.postUrl, message.groupId, message.settings, message.preview)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, error: 'Share failed' }));
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
});

function performShare(
  postUrl: string,
  groupId: string,
  _settings: ShareSettings,
  _preview: PostPreview
): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    try {
      logger.debug('content', 'Performing share', { groupId });
      resolve({ success: true });
    } catch (error) {
      resolve({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}

initialize();
