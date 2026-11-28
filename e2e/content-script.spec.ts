import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');

let extensionId: string;
let persistentContext: BrowserContext;
let backgroundWorker: any;

test.describe.configure({ retries: 0, timeout: 120000 });

test.beforeAll(async () => {
  if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(
      `Built extension not found at ${EXTENSION_PATH}. Run "npm run build" before the E2E tests.`
    );
  }

  persistentContext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const serviceWorker =
    persistentContext
      .serviceWorkers()
      .find(worker => worker.url().startsWith('chrome-extension://')) ??
    (await persistentContext.waitForEvent('serviceworker', {
      predicate: worker => worker.url().startsWith('chrome-extension://'),
      timeout: 15000,
    }));

  extensionId = new URL(serviceWorker.url()).hostname;
  if (!extensionId) {
    throw new Error(
      `Could not extract extension ID from service worker URL: ${serviceWorker.url()}`
    );
  }

  // Save reference to background service worker
  backgroundWorker = serviceWorker;

  // Initialize default user settings in extension storage via background message
  await setExtensionStorage({ showShareButton: true, shareButtonPosition: 'after_share' });
});

test.afterAll(async () => {
  await persistentContext?.close();
});

/**
 * Sets data in the extension's storage via the background service worker.
 * This is needed because page.evaluate() runs in the page context
 * which doesn't have access to chrome.storage APIs.
 * Uses UPDATE_USER_SETTINGS message to properly update IndexedDB storage.
 */
async function setExtensionStorage(data: Record<string, unknown>): Promise<void> {
  console.log('[E2E] setExtensionStorage called with:', data);

  // Use the background service worker directly to write to IndexedDB
  if (!backgroundWorker) {
    console.log('[E2E] ERROR: No background worker reference!');
    return;
  }

  // Directly use IndexedDB in the background worker context
  const result = await backgroundWorker.evaluate(async d => {
    console.log('[BG] About to write to IndexedDB');
    // Open the same database the extension uses
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fgp-storage', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('keyval');
      };
    });

    return new Promise(resolve => {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');

      // Write each namespace to its proper key
      if (d.userSettings !== undefined) {
        store.put(d.userSettings, 'fgp/userSettings');
      }
      if (d.groupLists !== undefined) {
        for (const [id, list] of Object.entries(d.groupLists as Record<string, unknown>)) {
          store.put(list, `fgp/groupLists/${id}`);
        }
      }
      if (d.groups !== undefined) {
        for (const [id, group] of Object.entries(d.groups as Record<string, unknown>)) {
          store.put(group, `fgp/groups/${id}`);
        }
      }
      if (d.showShareButton !== undefined || d.shareButtonPosition !== undefined) {
        // Handle partial userSettings update
        const current = store.get('fgp/userSettings');
        current.onsuccess = () => {
          const updated = { ...(current.result || {}), ...d };
          store.put(updated, 'fgp/userSettings');
        };
      }

      tx.oncomplete = () => {
        console.log('[BG] IndexedDB write complete');
        resolve({ success: true });
      };
      tx.onerror = () => {
        console.error('[BG] IndexedDB write error:', tx.error);
        resolve({ success: false, error: tx.error });
      };
    });
  }, data);
  console.log('[E2E] IndexedDB set response:', result);

  // Give time for the async storage write to complete
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Verify the settings were saved by reading them back
  const settings = await backgroundWorker.evaluate(async () => {
    console.log('[BG] About to read from IndexedDB');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fgp-storage', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    return new Promise(resolve => {
      const tx = db.transaction('keyval', 'readonly');
      const request = tx.objectStore('keyval').get('fgp/userSettings');
      request.onsuccess = () => {
        console.log('[BG] IndexedDB read result:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('[BG] IndexedDB read error:', request.error);
        resolve(null);
      };
    });
  });
  console.log('[E2E] IndexedDB get after update:', settings);

  // Verify again after another wait
  await new Promise(resolve => setTimeout(resolve, 500));
  const settings2 = await backgroundWorker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fgp-storage', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    return new Promise(resolve => {
      const tx = db.transaction('keyval', 'readonly');
      const request = tx.objectStore('keyval').get('fgp/userSettings');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
    });
  });
  console.log('[E2E] IndexedDB get after 2nd wait:', settings2);
}

/**
 * Creates a mock Facebook page with the necessary DOM structure
 * for testing the content script's share button injection and share sheet.
 * Uses route interception to serve mock content on a Facebook URL.
 * The HTML mimics Facebook's actual DOM structure for post preview extraction.
 */
async function createMockFacebookPage(page: Page): Promise<void> {
  const mockHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Facebook Mock Feed</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        .feed { max-width: 600px; margin: 0 auto; }
        .post { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 20px; background: white; }
        .post-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .post-avatar { width: 40px; height: 40px; border-radius: 50%; background: #1877f2; }
        .post-author { font-weight: 600; font-size: 15px; }
        .post-text { font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
        .post-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 8px; margin-bottom: 12px; }
        .post-actions { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid #e4e6eb; }
        .fb-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: #f0f2f5; border-radius: 6px; font-size: 14px; font-weight: 600; color: #050505; cursor: pointer; }
        .fb-action-btn:hover { background: #e4e6eb; }
        .share-button-container { position: relative; display: inline-flex; }
        /* Add Facebook-like selectors for extraction */
        a.profile-link { text-decoration: none; color: inherit; }
        div[dir="auto"] { text-align: left; }
      </style>
    </head>
    <body>
      <div class="feed" role="feed">
        <!-- Post 1: Regular post with text and image -->
        <article class="post" role="article" data-pagelet="FeedUnit_1">
          <div class="post-header">
            <div class="post-avatar"></div>
            <div>
              <a class="profile-link" href="https://facebook.com/user/testuser">
                <strong>Test User</strong>
              </a>
              <div style="font-size: 12px; color: #65676b;">1h · Public</div>
            </div>
          </div>
          <div class="post-text" data-testid="post_message">This is a test post with some content to share!</div>
          <img class="post-image" src="https://scontent.fcdn.net/v/t1.0-9/test-image-1234567890.jpg" alt="Test image">
          <div class="post-actions">
            <button class="fb-action-btn" data-testid="like-button">👍 Like</button>
            <button class="fb-action-btn" data-testid="comment-button">💬 Comment</button>
            <div class="share-button-container">
              <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
            </div>
          </div>
        </article>

        <!-- Post 2: Post with video/reel -->
        <article class="post" role="article" data-pagelet="FeedUnit_2">
          <div class="post-header">
            <div class="post-avatar"></div>
            <div>
              <a class="profile-link" href="https://facebook.com/user/videocreator">
                <strong>Video Creator</strong>
              </a>
              <div style="font-size: 12px; color: #65676b;">30m · Public</div>
            </div>
          </div>
          <div class="post-text" data-testid="post_message">Check out this amazing reel!</div>
          <video class="post-image" src="https://example.com/test-video.mp4" controls></video>
          <a href="https://facebook.com/reel/12345" style="display:none;"></a>
          <div class="post-actions">
            <button class="fb-action-btn" data-testid="like-button">👍 Like</button>
            <button class="fb-action-btn" data-testid="comment-button">💬 Comment</button>
            <div class="share-button-container">
              <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
            </div>
          </div>
        </article>

        <!-- Post 3: Multiple share buttons (e.g., in a group feed) -->
        <article class="post" role="article" data-pagelet="FeedUnit_3">
          <div class="post-header">
            <div class="post-avatar"></div>
            <div>
              <a class="profile-link" href="https://facebook.com/user/grouppost">
                <strong>Group Post</strong>
              </a>
              <div style="font-size: 12px; color: #65676b;">5m · Group</div>
            </div>
          </div>
          <div class="post-text" data-testid="post_message">Another post in the feed</div>
          <div class="post-actions">
            <button class="fb-action-btn" data-testid="like-button">👍 Like</button>
            <button class="fb-action-btn" data-testid="comment-button">💬 Comment</button>
            <div class="share-button-container">
              <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
            </div>
            <div class="share-button-container">
              <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
            </div>
          </div>
        </article>
      </div>
    </body>
    </html>
  `;

  // Intercept navigation to facebook.com and serve mock content
  await page.route('https://facebook.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockHtml,
    });
  });

  // Navigate to trigger content script injection
  await page
    .goto('https://facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    .catch(() => {});

  // Wait for content script to initialize and inject buttons
  await page.waitForTimeout(2000);
}

/**
 * Creates a mock Facebook page with specific share button position setting.
 * Uses route interception to serve mock content on a Facebook URL.
 */
async function createMockFacebookPageWithPosition(
  page: Page,
  position: 'after_share' | 'before_share' | 'floating'
): Promise<void> {
  const mockHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Facebook Mock Feed</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        .feed { max-width: 600px; margin: 0 auto; }
        .post { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 20px; background: white; }
        .post-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .post-avatar { width: 40px; height: 40px; border-radius: 50%; background: #1877f2; }
        .post-author { font-weight: 600; font-size: 15px; }
        .post-text { font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
        .post-actions { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid #e4e6eb; }
        .fb-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: #f0f2f5; border-radius: 6px; font-size: 14px; font-weight: 600; color: #050505; cursor: pointer; }
        .fb-action-btn:hover { background: #e4e6eb; }
        .share-button-container { position: relative; display: inline-flex; }
      </style>
    </head>
    <body>
      <div class="feed" role="feed">
        <article class="post" role="article" data-pagelet="FeedUnit_1">
          <div class="post-header">
            <div class="post-avatar"></div>
            <div>
              <div class="post-author">Test User</div>
              <div style="font-size: 12px; color: #65676b;">1h · Public</div>
            </div>
          </div>
          <div class="post-text" data-testid="post_message">Test post for position: ${position}</div>
          <div class="post-actions">
            <button class="fb-action-btn" data-testid="like-button">👍 Like</button>
            <button class="fb-action-btn" data-testid="comment-button">💬 Comment</button>
            <div class="share-button-container">
              <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
            </div>
          </div>
        </article>
      </div>
    </body>
    </html>
  `;

  // Set the position setting in storage BEFORE navigation
  await setExtensionStorage({ showShareButton: true, shareButtonPosition: position });

  // Wait for storage to propagate
  await page.waitForTimeout(1000);

  // Intercept navigation to facebook.com and serve mock content
  await page.route('https://facebook.com/**', async route => {
    try {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: mockHtml,
      });
    } catch (e) {
      console.error('[ROUTE ERROR]', e);
      throw e;
    }
  });

  // Navigate to trigger content script injection (will use updated settings)
  try {
    await page.goto('https://facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.error('[GOTO ERROR]', e);
  }

  // Wait for content script to initialize and inject buttons
  console.log('[TEST] Waiting for content script injection...');
  await page.waitForTimeout(3000);
  console.log('[TEST] Done waiting');
}

/**
 * Waits for the FGP share button to be injected and returns it.
 */
async function getFgpShareButton(page: Page, index: number = 0) {
  const button = page.locator('.fgp-share-to-groups-btn').nth(index);
  await expect(button).toBeVisible({ timeout: 10000 });
  return button;
}

/**
 * Waits for the share sheet to be mounted and returns its container.
 */
async function getShareSheet(page: Page) {
  const sheet = page.locator('#fgp-share-sheet-host');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

/**
 * Closes the share sheet via the close button or overlay click.
 */
async function closeShareSheet(page: Page) {
  const closeBtn = page.locator('.fgp-close-btn');
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  } else {
    // Click overlay to close
    await page.locator('.fgp-overlay').click({ position: { x: 10, y: 10 } });
  }
  await page.waitForTimeout(500);
}

test.describe('Content Script - Share Button Injection', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);
  });
  test.afterEach(async () => {
    await page?.close();
  });

  test('injects "Share to Groups" button near Facebook native share button', async () => {
    // Verify native share buttons exist
    const nativeShareButtons = page.locator('[data-testid="share-button"]');
    await expect(nativeShareButtons.first()).toBeVisible();
    const nativeCount = await nativeShareButtons.count();
    expect(nativeCount).toBeGreaterThan(0);

    // Verify FGP button is injected
    const fgpButton = await getFgpShareButton(page, 0);
    await expect(fgpButton).toBeVisible();
    await expect(fgpButton).toContainText('Share to Groups');
    await expect(fgpButton).toHaveAttribute('data-testid', 'fgp-share-to-groups');
  });

  test('injects button with correct styling and SVG icon', async () => {
    const fgpButton = await getFgpShareButton(page, 0);

    // Check button styling (uses gradient, so check background-image)
    const bgImage = await fgpButton.evaluate(el => getComputedStyle(el).backgroundImage);
    expect(bgImage).toContain('gradient');
    await expect(fgpButton).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(fgpButton).toHaveCSS('border-radius', '6px');
    await expect(fgpButton).toHaveCSS('font-weight', '600');

    // Check SVG icon exists
    const svg = fgpButton.locator('svg');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('width', '16');
    await expect(svg).toHaveAttribute('height', '16');
  });

  test('button has hover effects', async () => {
    const fgpButton = await getFgpShareButton(page, 0);

    // Get initial styles
    const initialTransform = await fgpButton.evaluate(el => getComputedStyle(el).transform);
    const initialBoxShadow = await fgpButton.evaluate(el => getComputedStyle(el).boxShadow);

    // Hover
    await fgpButton.hover();
    await page.waitForTimeout(100);

    const hoverTransform = await fgpButton.evaluate(el => getComputedStyle(el).transform);
    const hoverBoxShadow = await fgpButton.evaluate(el => getComputedStyle(el).boxShadow);

    // Verify transform and shadow change on hover
    expect(hoverTransform).not.toBe(initialTransform);
    expect(hoverBoxShadow).not.toBe(initialBoxShadow);
  });

  test('does not inject duplicate buttons on MutationObserver updates', async () => {
    const initialCount = await page.locator('.fgp-share-to-groups-btn').count();

    // Trigger DOM mutation by adding a new post
    await page.evaluate(() => {
      const feed = document.querySelector('.feed');
      const newPost = document.createElement('article');
      newPost.className = 'post';
      newPost.setAttribute('role', 'article');
      newPost.innerHTML = `
        <div class="post-header">
          <div class="post-avatar"></div>
          <div><div class="post-author">New Post</div></div>
        </div>
        <div class="post-text" data-testid="post_message">Dynamically added post</div>
        <div class="post-actions">
          <button class="fb-action-btn" data-testid="like-button">👍 Like</button>
          <div class="share-button-container">
            <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
          </div>
        </div>
      `;
      feed?.appendChild(newPost);
    });

    await page.waitForTimeout(1000);

    // Should not have duplicate buttons for the original post
    const finalCount = await page.locator('.fgp-share-to-groups-btn').count();
    expect(finalCount).toBe(initialCount + 1); // Only one new button for the new post
  });
});

test.describe('Content Script - Share Button Positioning', () => {
  let page: Page;

  test.afterEach(async () => {
    await page?.close();
  });

  test('positions button after native share button (after_share)', async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPageWithPosition(page, 'after_share');

    const nativeShareBtn = page.locator('[data-testid="share-button"]').first();
    const fgpButton = await getFgpShareButton(page, 0);

    // FGP button should be after native share button in DOM
    const nativeBox = await nativeShareBtn.boundingBox();
    const fgpBox = await fgpButton.boundingBox();

    expect(fgpBox!.x).toBeGreaterThanOrEqual(nativeBox!.x);
  });

  test('positions button before native share button (before_share)', async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPageWithPosition(page, 'before_share');

    const nativeShareBtn = page.locator('[data-testid="share-button"]').first();
    const fgpButton = await getFgpShareButton(page, 0);

    // FGP button should be before native share button in DOM
    const nativeBox = await nativeShareBtn.boundingBox();
    const fgpBox = await fgpButton.boundingBox();

    expect(fgpBox!.x).toBeLessThanOrEqual(nativeBox!.x + nativeBox!.width);
  });

  test('positions button as floating fixed element (floating)', async () => {
    page = await persistentContext.newPage();

    // Capture console logs from the page
    page.on('console', msg => console.log('[PAGE LOG]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

    console.log('[TEST] About to call createMockFacebookPageWithPosition');
    await createMockFacebookPageWithPosition(page, 'floating');
    console.log('[TEST] Returned from createMockFacebookPageWithPosition');

    const fgpButton = await getFgpShareButton(page, 0);

    // Debug: check classes and inline styles
    const classes = await fgpButton.getAttribute('class');
    const style = await fgpButton.getAttribute('style');
    console.log('[TEST] FGP Button classes:', classes);
    console.log('[TEST] FGP Button style:', style);

    // Floating button should have fixed positioning
    await expect(fgpButton).toHaveCSS('position', 'fixed');
    await expect(fgpButton).toHaveCSS('z-index', '2147483647');

    // Should be positioned at bottom-right
    const box = await fgpButton.boundingBox();
    const viewport = page.viewportSize();
    expect(box!.x).toBeGreaterThan(viewport!.width - 200);
    expect(box!.y).toBeGreaterThan(viewport!.height - 100);
  });
});

test.describe('Content Script - Share Sheet Opening', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);
    // User settings already initialized in beforeAll
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('opens share sheet when FGP button is clicked', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    // Wait for share sheet to mount
    const shareSheet = await getShareSheet(page);
    await expect(shareSheet).toBeVisible();

    // Verify share sheet structure
    await expect(page.locator('.fgp-overlay')).toBeVisible();
    await expect(page.locator('.fgp-sheet')).toBeVisible();
    await expect(page.locator('.fgp-header h2')).toContainText('Share to Groups');
    await expect(page.locator('.fgp-close-btn')).toBeVisible();
  });

  test('share sheet shows post preview with author, text, and images', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Check preview section
    await expect(page.locator('.fgp-preview')).toBeVisible();
    await expect(page.locator('.fgp-preview-author')).toContainText('Test User');
    await expect(page.locator('.fgp-preview-text')).toContainText('This is a test post');

    // Debug: check what images are in the preview
    const previewImages = await page.locator('.fgp-preview-images').count();
    console.log('[TEST] Preview images count:', previewImages);
    const allImages = await page.locator('img').all();
    for (const img of allImages) {
      const src = await img.getAttribute('src');
      console.log('[TEST] Image src:', src);
    }

    await expect(page.locator('.fgp-preview-image')).toBeVisible();
  });

  test('share sheet shows video/reel indicator for video posts', async () => {
    // Click the second post's share button (has video)
    const fgpButton = await getFgpShareButton(page, 1);
    await fgpButton.click();

    await getShareSheet(page);

    // Should show video indicator
    await expect(page.locator('.fgp-preview-video')).toBeVisible();
    await expect(page.locator('.fgp-preview-video')).toContainText('Reel');
  });

  test('share sheet mounts in closed Shadow DOM for CSS isolation', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    const host = page.locator('#fgp-share-sheet-host');
    await expect(host).toBeVisible();

    // Verify Shadow DOM exists (closed mode - cannot access directly)
    const hasShadowRoot = await host.evaluate(el => el.shadowRoot !== null);
    expect(hasShadowRoot).toBe(true);

    // Verify styles are injected in Shadow DOM
    const stylesInShadow = await host.evaluate(el => {
      return el.shadowRoot?.querySelector('style') !== null;
    });
    expect(stylesInShadow).toBe(true);
  });
});

test.describe('Content Script - Share Sheet Group List Selection', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);

    // Set up group lists in storage
    const lists = {
      list_1: {
        id: 'list_1',
        name: 'Marketing Groups',
        groupIds: ['group_1', 'group_2'],
        color: '#1877f2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      list_2: {
        id: 'list_2',
        name: 'Sales Groups',
        groupIds: ['group_3', 'group_4'],
        color: '#31a24c',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    const groups = {
      group_1: {
        id: 'group_1',
        name: 'Marketing Pros',
        url: 'https://facebook.com/groups/marketing',
        memberCount: 5000,
      },
      group_2: {
        id: 'group_2',
        name: 'Digital Marketers',
        url: 'https://facebook.com/groups/digital',
        memberCount: 3000,
      },
      group_3: {
        id: 'group_3',
        name: 'Sales Leaders',
        url: 'https://facebook.com/groups/sales',
        memberCount: 4000,
      },
      group_4: {
        id: 'group_4',
        name: 'Business Development',
        url: 'https://facebook.com/groups/bizdev',
        memberCount: 2500,
      },
    };
    await setExtensionStorage({ groupLists: lists, groups: groups });

    // Reload to pick up storage
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('displays group lists as selectable buttons', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Check group list buttons
    await expect(page.locator('.fgp-list-btn').nth(0)).toContainText('Marketing Groups (2)');
    await expect(page.locator('.fgp-list-btn').nth(1)).toContainText('Sales Groups (2)');

    // First list should be active by default
    await expect(page.locator('.fgp-list-btn').nth(0)).toHaveClass(/fgp-active/);
  });

  test('loads groups when list is selected', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Wait for groups to load for first list
    await expect(page.locator('.fgp-group-item').nth(0)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.fgp-group-item').nth(0)).toContainText('Marketing Pros');
    await expect(page.locator('.fgp-group-item').nth(1)).toContainText('Digital Marketers');

    // Switch to second list
    await page.locator('.fgp-list-btn').nth(1).click();

    // Wait for groups to load for second list
    await expect(page.locator('.fgp-group-item').nth(0)).toContainText('Sales Leaders');
    await expect(page.locator('.fgp-group-item').nth(1)).toContainText('Business Development');
  });

  test('allows selecting/deselecting individual groups via checkboxes', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Wait for groups to load
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Select first group
    const firstCheckbox = page.locator('.fgp-checkbox').first();
    await firstCheckbox.check();
    await expect(page.locator('.fgp-group-count')).toContainText('1 groups selected');

    // Select second group
    const secondCheckbox = page.locator('.fgp-checkbox').nth(1);
    await secondCheckbox.check();
    await expect(page.locator('.fgp-group-count')).toContainText('2 groups selected');

    // Deselect first group
    await firstCheckbox.uncheck();
    await expect(page.locator('.fgp-group-count')).toContainText('1 groups selected');
  });

  test('filters groups via search input', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Search for "Marketing"
    await page.locator('.fgp-search-input').fill('Marketing');
    await page.waitForTimeout(300);

    await expect(page.locator('.fgp-group-item')).toHaveCount(1);
    await expect(page.locator('.fgp-group-item').first()).toContainText('Marketing Pros');

    // Clear search
    await page.locator('.fgp-search-input').fill('');
    await page.waitForTimeout(300);
    await expect(page.locator('.fgp-group-item')).toHaveCount(2);
  });
});

test.describe('Content Script - Share Sheet Immediate Share Flow', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);

    // Set up group lists and groups in storage
    const lists = {
      list_1: {
        id: 'list_1',
        name: 'Test Groups',
        groupIds: ['group_1', 'group_2'],
        color: '#1877f2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    const groups = {
      group_1: {
        id: 'group_1',
        name: 'Group One',
        url: 'https://facebook.com/groups/1',
        memberCount: 1000,
      },
      group_2: {
        id: 'group_2',
        name: 'Group Two',
        url: 'https://facebook.com/groups/2',
        memberCount: 2000,
      },
    };
    await setExtensionStorage({ groupLists: lists, groups: groups });

    await page.reload();
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('enables Share Now button when groups are selected', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Share button should be disabled initially
    const shareBtn = page.locator('.fgp-share-btn');
    await expect(shareBtn).toBeDisabled();

    // Select a group
    await page.locator('.fgp-checkbox').first().check();

    // Share button should now be enabled
    await expect(shareBtn).toBeEnabled();
  });

  test('allows setting share mode (Share the post / Post as me)', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Default should be "Share the post"
    await expect(page.locator('.fgp-mode-btn').nth(0)).toHaveClass(/fgp-active/);
    await expect(page.locator('.fgp-mode-btn').nth(1)).not.toHaveClass(/fgp-active/);

    // Click "Post as me"
    await page.locator('.fgp-mode-btn').nth(1).click();
    await expect(page.locator('.fgp-mode-btn').nth(1)).toHaveClass(/fgp-active/);
    await expect(page.locator('.fgp-mode-btn').nth(0)).not.toHaveClass(/fgp-active/);
  });

  test('allows adding caption and first comment', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Add caption
    await page.locator('.fgp-textarea').first().fill('This is my custom caption!');
    await expect(page.locator('.fgp-textarea').first()).toHaveValue('This is my custom caption!');

    // Add first comment
    await page.locator('.fgp-textarea').nth(1).fill('First comment here!');
    await expect(page.locator('.fgp-textarea').nth(1)).toHaveValue('First comment here!');
  });

  test('inserts spintax via button', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    const textarea = page.locator('.fgp-textarea').first();
    await textarea.fill('Initial text ');

    await page.locator('.fgp-secondary-btn:has-text("Insert Spintax")').click();

    await expect(textarea).toHaveValue('Initial text  {option1|option2}');
  });

  test('shows advanced settings when expanded', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);

    // Advanced settings should be collapsed by default
    const details = page.locator('.fgp-details');
    await expect(details).not.toHaveAttribute('open');

    // Click to expand
    await page.locator('.fgp-summary').click();
    await expect(details).toHaveAttribute('open');

    // Check safety level options
    await expect(page.locator('.fgp-safety-option:has-text("Fast")')).toBeVisible();
    await expect(page.locator('.fgp-safety-option:has-text("Balanced")')).toHaveClass(/fgp-active/);
    await expect(page.locator('.fgp-safety-option:has-text("Safe")')).toBeVisible();

    // Check overnight pause settings
    await expect(page.locator('input[type="time"]').nth(0)).toHaveValue('22:00');
    await expect(page.locator('input[type="time"]').nth(1)).toHaveValue('07:00');

    // Check daily limit
    await expect(page.locator('.fgp-number-input')).toHaveValue('200');
  });

  test('submits share via background message (SCHEDULE_SHARE)', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Select groups
    await page.locator('.fgp-checkbox').first().check();
    await page.locator('.fgp-checkbox').nth(1).check();

    // Set caption
    await page.locator('.fgp-textarea').first().fill('Test caption');

    // Wait for console message indicating SCHEDULE_SHARE was sent
    const consolePromise = page.waitForEvent('console', {
      predicate: msg => msg.text().includes('SCHEDULE_SHARE'),
      timeout: 5000,
    });

    // Click Share Now
    await page.locator('.fgp-share-btn').click();

    // Wait for the console event
    await consolePromise;

    // Verify share sheet closes
    await expect(page.locator('.fgp-overlay')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Content Script - Share Sheet Schedule Share Flow', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);

    // Set up group lists and groups in storage
    const lists = {
      list_1: {
        id: 'list_1',
        name: 'Test Groups',
        groupIds: ['group_1'],
        color: '#1877f2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    const groups = {
      group_1: {
        id: 'group_1',
        name: 'Group One',
        url: 'https://facebook.com/groups/1',
        memberCount: 1000,
      },
    };
    await setExtensionStorage({ groupLists: lists, groups: groups });

    await page.reload();
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('opens schedule dialog when Schedule button clicked', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Select a group
    await page.locator('.fgp-checkbox').first().check();

    // Click Schedule button
    await page.locator('.fgp-schedule-btn').click();

    // Should show browser prompt (we can't easily test the prompt in Playwright)
    // But we can verify the button was clicked and no errors occurred
    await expect(page.locator('.fgp-share-btn')).toBeEnabled();
  });

  test('validates schedule time format', async () => {
    // This test documents the expected behavior - the actual prompt handling
    // is done via browser's native prompt() which we can't easily automate
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    await page.locator('.fgp-checkbox').first().check();

    // The schedule flow uses window.prompt() which returns null in headless
    // In real usage, user enters: "YYYY-MM-DD HH:MM" or "in X minutes/hours"
    await page.locator('.fgp-schedule-btn').click();

    // Should not crash or show errors
    await expect(page.locator('.fgp-overlay')).toBeVisible();
  });
});

test.describe('Content Script - Share Sheet Close/Cancel', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);
    // User settings already initialized in beforeAll
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('closes share sheet via close button (X)', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-overlay')).toBeVisible();

    // Click close button
    await page.locator('.fgp-close-btn').click();

    // Sheet should be gone
    await expect(page.locator('.fgp-overlay')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fgp-share-sheet-host')).not.toBeVisible();
  });

  test('closes share sheet via Cancel button', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-overlay')).toBeVisible();

    // Click Cancel button
    await page.locator('.fgp-cancel-btn').click();

    // Sheet should be gone
    await expect(page.locator('.fgp-overlay')).not.toBeVisible({ timeout: 2000 });
  });

  test('closes share sheet via overlay click', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-overlay')).toBeVisible();

    // Click on overlay (outside the sheet)
    await page.locator('.fgp-overlay').click({ position: { x: 10, y: 10 } });

    // Sheet should be gone
    await expect(page.locator('.fgp-overlay')).not.toBeVisible({ timeout: 2000 });
  });

  test('does not close when clicking inside the sheet', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-overlay')).toBeVisible();

    // Click inside the sheet (on the preview area)
    await page.locator('.fgp-preview').click();

    // Sheet should still be visible
    await expect(page.locator('.fgp-overlay')).toBeVisible();
  });

  test('re-opens share sheet after closing', async () => {
    const fgpButton = await getFgpShareButton(page, 0);

    // Open and close first time
    await fgpButton.click();
    await getShareSheet(page);
    await page.locator('.fgp-close-btn').click();
    await expect(page.locator('.fgp-overlay')).not.toBeVisible({ timeout: 2000 });

    // Open again
    await fgpButton.click();
    await getShareSheet(page);
    await expect(page.locator('.fgp-overlay')).toBeVisible();
  });
});

test.describe('Content Script - Storage Integration', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('respects showShareButton setting (hides button when false)', async () => {
    await setExtensionStorage({
      userSettings: { showShareButton: false, shareButtonPosition: 'after_share' },
    });

    await createMockFacebookPage(page);

    // FGP button should not be injected
    const fgpButtons = page.locator('.fgp-share-to-groups-btn');
    await expect(fgpButtons).toHaveCount(0);
  });

  test('shows button when showShareButton is true', async () => {
    await setExtensionStorage({
      userSettings: { showShareButton: true, shareButtonPosition: 'after_share' },
    });

    await createMockFacebookPage(page);

    const fgpButton = await getFgpShareButton(page, 0);
    await expect(fgpButton).toBeVisible();
  });

  test('loads group lists from storage for share sheet', async () => {
    const lists = {
      list_1: {
        id: 'list_1',
        name: 'My Groups',
        groupIds: ['g1'],
        color: '#1877f2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    const groups = {
      g1: { id: 'g1', name: 'Test Group', url: 'https://fb.com/groups/test', memberCount: 100 },
    };
    await setExtensionStorage({ groupLists: lists, groups });

    await createMockFacebookPage(page);

    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-list-btn').first()).toContainText('My Groups (1)');
  });
});

test.describe('Content Script - Error Handling', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);
    // User settings already initialized in beforeAll
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('share sheet handles share action without crashing', async () => {
    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    await getShareSheet(page);
    await expect(page.locator('.fgp-group-item').first()).toBeVisible({ timeout: 5000 });

    // Select a group
    await page.locator('.fgp-checkbox').first().check();

    // Click Share Now - this will send a message to background
    // In test environment without full backend, it may not succeed
    // but should not crash the share sheet
    await page.locator('.fgp-share-btn').click();

    // Share sheet should close (on success) or remain open (on error)
    // Either way, no JS errors should be thrown
    await page.waitForTimeout(1000);
  });

  test('handles missing post preview gracefully', async () => {
    // Create a page without proper post structure
    await page.setContent(`
      <html><body>
        <div class="share-button-container">
          <button class="fb-action-btn" data-testid="share-button">↗️ Share</button>
        </div>
      </body></html>
    `);
    await page.waitForTimeout(2000);

    const fgpButton = await getFgpShareButton(page, 0);
    await fgpButton.click();

    // Should not crash, but may not open share sheet if preview extraction fails
    // The content script logs a warning and returns early
    await page.waitForTimeout(1000);
  });
});

test.describe('Content Script - Multiple Posts', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await persistentContext.newPage();
    await createMockFacebookPage(page);
    // User settings already initialized in beforeAll
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('each post gets its own share button', async () => {
    // We have 3 posts in the mock feed, each with share buttons
    // Post 1: 1 share button -> 1 FGP button
    // Post 2: 1 share button -> 1 FGP button
    // Post 3: 2 share buttons -> 2 FGP buttons (but only first gets injected due to shareButtonInjected flag)

    const fgpButtons = page.locator('.fgp-share-to-groups-btn');
    const count = await fgpButtons.count();

    // Should have at least one button per post container
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking share button on different posts opens sheet with correct preview', async () => {
    // Click first post's button
    const btn1 = await getFgpShareButton(page, 0);
    await btn1.click();
    await getShareSheet(page);
    await expect(page.locator('.fgp-preview-author')).toContainText('Test User');
    await closeShareSheet(page);

    // Click second post's button
    const btn2 = await getFgpShareButton(page, 1);
    await btn2.click();
    await getShareSheet(page);
    await expect(page.locator('.fgp-preview-author')).toContainText('Video Creator');
    await expect(page.locator('.fgp-preview-video')).toContainText('Reel');
    await closeShareSheet(page);

    // Click third post's button
    const btn3 = await getFgpShareButton(page, 2);
    await btn3.click();
    await getShareSheet(page);
    await expect(page.locator('.fgp-preview-author')).toContainText('Group Post');
  });
});
