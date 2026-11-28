/**
 * Strategy 2: Structural selectors
 * Uses DOM structure and relative positioning to find elements
 * Fallback when aria-label attributes change
 */

import type { SelectorStrategy } from '../types';

export function createShareButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  return {
    name: 'structural-share-button',
    select: (root: Document | Element) => {
      // Strategy: Find post article, then look for share button near it
      const articles = root.querySelectorAll('[role="article"], div[data-pagelet*="FeedUnit"]');
      for (const article of articles) {
        // Look for share button in the article's footer/action area
        const shareBtns = article.querySelectorAll(
          'button[aria-label*="share" i], ' +
            'button[aria-label*="compartir" i], ' +
            'button[aria-label*="partager" i], ' +
            'button[aria-label*="teilen" i], ' +
            'div[role="button"][aria-label*="share" i], ' +
            'div[role="button"][aria-label*="compartir" i]'
        );
        for (const btn of shareBtns) {
          if (isVisible(btn) && isLikelyShareButton(btn)) return btn as HTMLButtonElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && isLikelyShareButton(el),
  };
}

export function createShareDialogStrategy(): SelectorStrategy<HTMLDivElement> {
  return {
    name: 'structural-share-dialog',
    select: (root: Document | Element) => {
      // Strategy: Find the top-most dialog that contains share-related content
      const dialogs = root.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        const text = dialog.textContent?.toLowerCase() || '';
        if (
          text.includes('share') ||
          text.includes('compartir') ||
          text.includes('partager') ||
          text.includes('teilen')
        ) {
          if (isVisible(dialog)) return dialog as HTMLDivElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && el.querySelector('[role="button"]') !== null,
  };
}

export function createGroupInputStrategy(): SelectorStrategy<HTMLInputElement> {
  return {
    name: 'structural-group-input',
    select: (root: Document | Element) => {
      // Strategy: In share dialog, find input that's focused or near "group" label
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const inputs = dialog.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        const placeholder = (input as HTMLInputElement).placeholder?.toLowerCase() || '';
        const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
        const parentText = input.parentElement?.textContent?.toLowerCase() || '';

        if (
          placeholder.includes('group') ||
          ariaLabel.includes('group') ||
          parentText.includes('group') ||
          placeholder.includes('grupo') ||
          ariaLabel.includes('grupo') ||
          placeholder.includes('groupe') ||
          ariaLabel.includes('groupe')
        ) {
          if (isVisible(input)) return input as HTMLInputElement;
        }
      }

      // Fallback: first visible text input in dialog
      for (const input of inputs) {
        if (isVisible(input)) return input as HTMLInputElement;
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && !el.readOnly,
  };
}

export function createPostButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  return {
    name: 'structural-post-button',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const buttons = dialog.querySelectorAll('[role="button"], button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (
          text.includes('post') ||
          text.includes('share') ||
          text.includes('publicar') ||
          text.includes('partager') ||
          text.includes('posten') ||
          text.includes('发布') ||
          text.includes('게시') ||
          text.includes('paylaş')
        ) {
          if (isVisible(btn) && !btn.disabled) return btn as HTMLButtonElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled,
  };
}

export function createCaptionInputStrategy(): SelectorStrategy<
  HTMLTextAreaElement | HTMLDivElement
> {
  return {
    name: 'structural-caption-input',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      // Look for textarea or contenteditable near "say something" or similar
      const textareas = dialog.querySelectorAll('textarea');
      for (const ta of textareas) {
        const placeholder = ta.placeholder?.toLowerCase() || '';
        if (
          placeholder.includes('say') ||
          placeholder.includes('escribe') ||
          placeholder.includes('écris') ||
          placeholder.includes('schreib') ||
          placeholder.includes('what') ||
          placeholder.includes('mind')
        ) {
          if (isVisible(ta)) return ta;
        }
      }

      // contenteditable divs
      const editables = dialog.querySelectorAll('[contenteditable="true"]');
      for (const ed of editables) {
        if (isVisible(ed)) return ed as HTMLDivElement;
      }

      // Any visible textarea
      for (const ta of textareas) {
        if (isVisible(ta)) return ta;
      }
      return null;
    },
    validate: el => isVisible(el),
  };
}

export function createFirstCommentInputStrategy(): SelectorStrategy<HTMLTextAreaElement> {
  return {
    name: 'structural-first-comment-input',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const textareas = dialog.querySelectorAll('textarea');
      for (const ta of textareas) {
        const placeholder = ta.placeholder?.toLowerCase() || '';
        if (
          placeholder.includes('comment') ||
          placeholder.includes('comentario') ||
          placeholder.includes('commentaire') ||
          placeholder.includes('kommentar')
        ) {
          if (isVisible(ta)) return ta;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && !el.readOnly,
  };
}

export function createGroupFeedItemStrategy(): SelectorStrategy<Element[]> {
  return {
    name: 'structural-group-feed-item',
    select: (root: Document | Element) => {
      // Strategy: Find list containers and get their listitems
      const listContainers = root.querySelectorAll(
        '[role="list"], [role="feed"], [data-pagelet*="Groups"]'
      );
      for (const container of listContainers) {
        const items = container.querySelectorAll('[role="listitem"]');
        if (items.length > 0) return Array.from(items);
      }

      // Fallback: any listitem that contains a group link
      const allItems = root.querySelectorAll('[role="listitem"]');
      const groupItems: Element[] = [];
      for (const item of allItems) {
        if (item.querySelector('a[href*="/groups/"]')) groupItems.push(item);
      }
      return groupItems.length > 0 ? groupItems : Array.from(allItems);
    },
    validate: els => els.length > 0,
  };
}

export function createGroupNameStrategy(): SelectorStrategy<string> {
  return {
    name: 'structural-group-name',
    select: (root: Document | Element) => {
      // Strategy: In a group feed item, find the heading or strong text
      const headings = root.querySelectorAll('[role="heading"], strong, h3, h4');
      for (const h of headings) {
        const text = h.textContent?.trim() || '';
        if (text.length > 1 && text.length < 100 && !text.includes('\n')) return text;
      }

      // Fallback: first dir=auto with reasonable length
      const autos = root.querySelectorAll('[dir="auto"]');
      for (const a of autos) {
        const text = a.textContent?.trim() || '';
        if (text.length > 1 && text.length < 100 && !text.includes('\n')) return text;
      }
      return '';
    },
    validate: name => name.length > 1,
  };
}

export function createGroupLinkStrategy(): SelectorStrategy<string> {
  return {
    name: 'structural-group-link',
    select: (root: Document | Element) => {
      const link = root.querySelector('a[href*="/groups/"]') as HTMLAnchorElement;
      return link?.href || '';
    },
    validate: url => url.includes('/groups/'),
  };
}

export function createPostAuthorStrategy(): SelectorStrategy<{ name: string; url: string }> {
  return {
    name: 'structural-post-author',
    select: (root: Document | Element) => {
      // Strategy: Find author link near top of post
      const authorLink = root.querySelector(
        'a[href*="/user/"], a[href*="/profile/"]'
      ) as HTMLAnchorElement;
      if (authorLink) {
        const name =
          authorLink.textContent?.trim() ||
          authorLink.querySelector('strong')?.textContent?.trim() ||
          authorLink.querySelector('[role="heading"]')?.textContent?.trim() ||
          '';
        if (name) return { name, url: authorLink.href };
      }
      return { name: '', url: '' };
    },
    validate: author => author.name.length > 0 && author.url.length > 0,
  };
}

export function createPostTextStrategy(): SelectorStrategy<string> {
  return {
    name: 'structural-post-text',
    select: (root: Document | Element) => {
      // Strategy: Find main text content in post
      const textSelectors = [
        '[data-testid="post_message"]',
        '[data-ad-comet-preview="message"]',
        'div[data-testid="post_message"]',
      ];
      for (const sel of textSelectors) {
        const el = root.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    },
    validate: text => text.length > 0,
  };
}

export function createPostImagesStrategy(): SelectorStrategy<string[]> {
  return {
    name: 'structural-post-images',
    select: (root: Document | Element) => {
      const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
      const urls = imgs
        .map(img => img.src)
        .filter(
          src =>
            src &&
            src.includes('fbcdn') &&
            !src.includes('profile') &&
            !src.includes('emoji') &&
            src.length > 50
        );
      return urls;
    },
    validate: urls => urls.length > 0,
  };
}

export function createPostUrlStrategy(): SelectorStrategy<string> {
  return {
    name: 'structural-post-url',
    select: (root: Document | Element) => {
      const link = root.querySelector(
        'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]'
      ) as HTMLAnchorElement;
      return link?.href || '';
    },
    validate: url => url.includes('facebook.com'),
  };
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

function isLikelyShareButton(el: Element): boolean {
  const text = el.textContent?.toLowerCase() || '';
  const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
  return (
    text.includes('share') ||
    ariaLabel.includes('share') ||
    text.includes('compartir') ||
    ariaLabel.includes('compartir') ||
    text.includes('partager') ||
    ariaLabel.includes('partager')
  );
}
