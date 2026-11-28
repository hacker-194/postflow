/**
 * Strategy 1: ARIA-label / Role / TestID selectors
 * Most reliable - uses Facebook's accessibility attributes
 */

import type { SelectorStrategy } from '../types';
import { getSelectors } from '../selectors';

export function createShareButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  const selectors = getSelectors().shareButton;
  return {
    name: 'aria-label-share-button',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLButtonElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled,
  };
}

export function createShareDialogStrategy(): SelectorStrategy<HTMLDivElement> {
  const selectors = getSelectors().shareDialog;
  return {
    name: 'aria-label-share-dialog',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLDivElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el),
  };
}

export function createGroupInputStrategy(): SelectorStrategy<HTMLInputElement> {
  const selectors = getSelectors().groupInput;
  return {
    name: 'aria-label-group-input',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLInputElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && !el.readOnly,
  };
}

export function createPostButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  const selectors = getSelectors().postButton;
  return {
    name: 'aria-label-post-button',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLButtonElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled,
  };
}

export function createCaptionInputStrategy(): SelectorStrategy<
  HTMLTextAreaElement | HTMLDivElement
> {
  const selectors = getSelectors().captionInput;
  return {
    name: 'aria-label-caption-input',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLTextAreaElement | HTMLDivElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el),
  };
}

export function createFirstCommentInputStrategy(): SelectorStrategy<HTMLTextAreaElement> {
  const selectors = getSelectors().firstCommentInput;
  return {
    name: 'aria-label-first-comment-input',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLTextAreaElement;
        if (el && isVisible(el)) return el;
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && !el.readOnly,
  };
}

export function createGroupFeedItemStrategy(): SelectorStrategy<Element[]> {
  const selectors = getSelectors().groupFeedItem;
  return {
    name: 'aria-label-group-feed-item',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const els = Array.from(root.querySelectorAll(sel));
        if (els.length > 0) return els;
      }
      return [];
    },
    validate: els => els.length > 0,
  };
}

export function createGroupNameStrategy(): SelectorStrategy<string> {
  const selectors = getSelectors().groupName;
  return {
    name: 'aria-label-group-name',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    },
    validate: name => name.length > 1,
  };
}

export function createGroupLinkStrategy(): SelectorStrategy<string> {
  const selectors = getSelectors().groupLink;
  return {
    name: 'aria-label-group-link',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLAnchorElement;
        if (el?.href) return el.href;
      }
      return '';
    },
    validate: url => url.includes('/groups/'),
  };
}

export function createPostAuthorStrategy(): SelectorStrategy<{ name: string; url: string }> {
  const selectors = getSelectors().postAuthor;
  return {
    name: 'aria-label-post-author',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLAnchorElement;
        if (el?.textContent?.trim() && el.href) {
          return { name: el.textContent.trim(), url: el.href };
        }
      }
      return { name: '', url: '' };
    },
    validate: author => author.name.length > 0 && author.url.length > 0,
  };
}

export function createPostTextStrategy(): SelectorStrategy<string> {
  const selectors = getSelectors().postText;
  return {
    name: 'aria-label-post-text',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    },
    validate: text => text.length > 0,
  };
}

export function createPostImagesStrategy(): SelectorStrategy<string[]> {
  const selectors = getSelectors().postImages;
  return {
    name: 'aria-label-post-images',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const imgs = Array.from(root.querySelectorAll(sel)) as HTMLImageElement[];
        const urls = imgs
          .map(img => img.src)
          .filter(
            src => src && !src.includes('profile') && !src.includes('emoji') && src.length > 50
          );
        if (urls.length > 0) return urls;
      }
      return [];
    },
    validate: urls => urls.length > 0,
  };
}

export function createPostUrlStrategy(): SelectorStrategy<string> {
  const selectors = getSelectors().postUrl;
  return {
    name: 'aria-label-post-url',
    select: (root: Document | Element) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel) as HTMLAnchorElement;
        if (el?.href) return el.href;
      }
      return '';
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
