/**
 * Strategy 4: Shadow DOM piercing
 * Handles Facebook's potential move to Shadow DOM for components
 * Uses recursive shadow root traversal
 */

import type { SelectorStrategy } from '../types';

function getAllShadowRoots(root: Document | Element): ShadowRoot[] {
  const roots: ShadowRoot[] = [];

  function traverse(node: Node) {
    if (node instanceof Element && node.shadowRoot) {
      roots.push(node.shadowRoot);
      // Recursively check nested shadow roots
      node.shadowRoot.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) roots.push(el.shadowRoot);
      });
    }
    node.childNodes.forEach(traverse);
  }

  traverse(root);
  return roots;
}

function queryAllInShadowRoots(roots: ShadowRoot[], selector: string): Element[] {
  const results: Element[] = [];
  for (const shadowRoot of roots) {
    const els = shadowRoot.querySelectorAll(selector);
    results.push(...Array.from(els));
  }
  return results;
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

function createShadowAwareSelector<T>(
  name: string,
  selectors: string[],
  validator: (el: Element) => boolean
): SelectorStrategy<T> {
  return {
    name,
    select: (root: Document | Element) => {
      // First try regular DOM
      for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el && validator(el)) return el as T;
      }

      // Then try shadow DOM
      const shadowRoots = getAllShadowRoots(root);
      for (const sel of selectors) {
        const els = queryAllInShadowRoots(shadowRoots, sel);
        for (const el of els) {
          if (validator(el)) return el as T;
        }
      }

      return null;
    },
    validate: el => validator(el as Element),
  };
}

export const createShareButtonStrategy = () =>
  createShadowAwareSelector<HTMLButtonElement>(
    'shadow-dom-share-button',
    [
      '[data-testid="share-button"]',
      '[role="button"][aria-label*="Share" i]',
      '[role="button"][aria-label*="Compartir" i]',
      '[role="button"][aria-label*="Partager" i]',
      '[role="button"][aria-label*="Teilen" i]',
      'button:has-text("Share" i)',
      'button:has-text("Compartir" i)',
      'button:has-text("Partager" i)',
      'button:has-text("Teilen" i)',
    ],
    el => isVisible(el) && !el.hasAttribute('disabled')
  );

export const createShareDialogStrategy = () =>
  createShadowAwareSelector<HTMLDivElement>(
    'shadow-dom-share-dialog',
    [
      '[role="dialog"]:has-text("Share" i)',
      '[role="dialog"]:has-text("Compartir" i)',
      '[role="dialog"]:has-text("Partager" i)',
      '[role="dialog"]:has-text("Teilen" i)',
      '[data-testid="share-dialog"]',
    ],
    el => isVisible(el)
  );

export const createGroupInputStrategy = () =>
  createShadowAwareSelector<HTMLInputElement>(
    'shadow-dom-group-input',
    [
      'input[placeholder*="group" i]',
      'input[aria-label*="group" i]',
      'input[data-testid*="group" i]',
      'input[placeholder*="grupo" i]',
      'input[placeholder*="groupe" i]',
      'input[placeholder*="gruppe" i]',
    ],
    el => isVisible(el) && !el.hasAttribute('disabled') && !el.hasAttribute('readonly')
  );

export const createPostButtonStrategy = () =>
  createShadowAwareSelector<HTMLButtonElement>(
    'shadow-dom-post-button',
    [
      '[role="button"]:has-text("Post" i)',
      '[role="button"]:has-text("Share" i)',
      '[role="button"]:has-text("Publicar" i)',
      '[role="button"]:has-text("Partager" i)',
      '[role="button"]:has-text("Posten" i)',
      '[data-testid="share-button-post"]',
      '[data-testid="composer-post-button"]',
    ],
    el => isVisible(el) && !el.hasAttribute('disabled')
  );

export const createCaptionInputStrategy = () =>
  createShadowAwareSelector<HTMLTextAreaElement | HTMLDivElement>(
    'shadow-dom-caption-input',
    [
      'textarea[placeholder*="say" i]',
      'textarea[placeholder*="escribe" i]',
      'textarea[placeholder*="écris" i]',
      'textarea[placeholder*="schreib" i]',
      '[contenteditable="true"][data-testid*="caption"]',
      '[contenteditable="true"][role="textbox"]',
    ],
    el => isVisible(el)
  );

export const createFirstCommentInputStrategy = () =>
  createShadowAwareSelector<HTMLTextAreaElement>(
    'shadow-dom-first-comment-input',
    [
      'textarea[placeholder*="comment" i]',
      'textarea[placeholder*="comentario" i]',
      'textarea[placeholder*="commentaire" i]',
      'textarea[placeholder*="kommentar" i]',
    ],
    el => isVisible(el) && !el.hasAttribute('disabled') && !el.hasAttribute('readonly')
  );

export const createGroupFeedItemStrategy = () =>
  createShadowAwareSelector<Element[]>(
    'shadow-dom-group-feed-item',
    [
      '[role="listitem"]',
      '[data-testid="group-card"]',
      '[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]',
      'div[role="article"]',
    ],
    els => Array.isArray(els) && els.length > 0
  );

export const createGroupNameStrategy = () =>
  createShadowAwareSelector<string>(
    'shadow-dom-group-name',
    ['[role="heading"]', 'strong', '[data-testid="group-name"]', '[dir="auto"]', 'h3', 'h4'],
    el => {
      const text = (el as Element).textContent?.trim() || '';
      return text.length > 1 && text.length < 100;
    }
  );

export const createGroupLinkStrategy = () =>
  createShadowAwareSelector<string>(
    'shadow-dom-group-link',
    ['a[href*="/groups/"]', 'a[href*="facebook.com/groups/"]'],
    el => (el as HTMLAnchorElement).href?.includes('/groups/') ?? false
  );

export const createPostAuthorStrategy = () =>
  createShadowAwareSelector<{ name: string; url: string }>(
    'shadow-dom-post-author',
    ['a[href*="/user/"]', 'a[href*="/profile/"]'],
    el => {
      const anchor = el as HTMLAnchorElement;
      const name =
        anchor.textContent?.trim() || anchor.querySelector('strong')?.textContent?.trim() || '';
      return name.length > 0 && anchor.href.length > 0;
    }
  );

export const createPostTextStrategy = () =>
  createShadowAwareSelector<string>(
    'shadow-dom-post-text',
    [
      '[data-testid="post_message"]',
      '[data-ad-comet-preview="message"]',
      '.x1iorvi4',
      '[data-testid="post-message"]',
    ],
    el => (el as Element).textContent?.trim().length > 0
  );

export const createPostImagesStrategy = () =>
  createShadowAwareSelector<string[]>(
    'shadow-dom-post-images',
    ['img[src*="scontent"]', 'img[src*="fbcdn"]'],
    els => {
      const urls = (els as Element[])
        .map(e => (e as HTMLImageElement).src)
        .filter(
          src => src && !src.includes('profile') && !src.includes('emoji') && src.length > 50
        );
      return urls.length > 0;
    }
  );

export const createPostUrlStrategy = () =>
  createShadowAwareSelector<string>(
    'shadow-dom-post-url',
    ['a[href*="/posts/"]', 'a[href*="/videos/"]', 'a[href*="/reel/"]'],
    el => (el as HTMLAnchorElement).href?.includes('facebook.com') ?? false
  );
