/**
 * Strategy 3: Multi-language text content matching
 * Finds elements by their visible text content in multiple languages
 * Fallback when structure and aria-labels both change
 */

import type { SelectorStrategy } from '../types';

const SHARE_TEXTS = [
  'share',
  'compartir',
  'partager',
  'teilen',
  'condividi',
  '分享',
  '공유',
  'paylaş',
  'partilhar',
  'compartilhar',
  'مشاركة',
  'به اشتراک گذاشتن',
  'シェア',
  '分享',
  'مشاركة',
];

const POST_TEXTS = [
  'post',
  'publicar',
  'partager',
  'posten',
  'pubblicare',
  '发布',
  '게시',
  'paylaş',
  'publicar',
  'نشر',
  '投稿',
  '发布',
  'پست کردن',
];

const GROUP_TEXTS = [
  'group',
  'grupo',
  'groupe',
  'gruppe',
  'gruppo',
  '群组',
  '그룹',
  'grup',
  'grupo',
  'مجموعة',
  'группа',
  'група',
  'グループ',
  '群組',
];

const COMMENT_TEXTS = [
  'comment',
  'comentario',
  'commentaire',
  'kommentar',
  'commento',
  '评论',
  '댓글',
  'yorum',
  'comentário',
  'تعليق',
  'комментарий',
  'コメント',
  '評論',
];

const SAY_TEXTS = [
  'say',
  'escribe',
  'écris',
  'schreib',
  'scrivi',
  '写',
  '써',
  'yaz',
  'escreva',
  'اكتب',
  'say something',
  "what's on your mind",
  'qué piensas',
  'à quoi pensez-vous',
  'woran denkst du',
  'a cosa pensi',
  '你在想什么',
  '무슨 생각을',
];

function hasTextMatch(element: Element, keywords: string[]): boolean {
  const text = (element.textContent || '').toLowerCase();
  const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
  const placeholder = (element as HTMLInputElement).placeholder?.toLowerCase() || '';
  const title = (element.getAttribute('title') || '').toLowerCase();

  const allText = `${text} ${ariaLabel} ${placeholder} ${title}`;
  return keywords.some(kw => allText.includes(kw.toLowerCase()));
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

export function createShareButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  return {
    name: 'text-match-share-button',
    select: (root: Document | Element) => {
      const buttons = root.querySelectorAll('button, [role="button"], div[role="button"]');
      for (const btn of buttons) {
        if (isVisible(btn) && hasTextMatch(btn, SHARE_TEXTS)) {
          return btn as HTMLButtonElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && hasTextMatch(el, SHARE_TEXTS),
  };
}

export function createShareDialogStrategy(): SelectorStrategy<HTMLDivElement> {
  return {
    name: 'text-match-share-dialog',
    select: (root: Document | Element) => {
      const dialogs = root.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        if (isVisible(dialog) && hasTextMatch(dialog, SHARE_TEXTS)) {
          return dialog as HTMLDivElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && hasTextMatch(el, SHARE_TEXTS),
  };
}

export function createGroupInputStrategy(): SelectorStrategy<HTMLInputElement> {
  return {
    name: 'text-match-group-input',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const inputs = dialog.querySelectorAll('input[type="text"], input:not([type]), textarea');
      for (const input of inputs) {
        if (isVisible(input) && hasTextMatch(input, GROUP_TEXTS)) {
          return input as HTMLInputElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && !el.readOnly && hasTextMatch(el, GROUP_TEXTS),
  };
}

export function createPostButtonStrategy(): SelectorStrategy<HTMLButtonElement> {
  return {
    name: 'text-match-post-button',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const buttons = dialog.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        if (isVisible(btn) && !btn.disabled && hasTextMatch(btn, POST_TEXTS)) {
          return btn as HTMLButtonElement;
        }
      }
      return null;
    },
    validate: el => isVisible(el) && !el.disabled && hasTextMatch(el, POST_TEXTS),
  };
}

export function createCaptionInputStrategy(): SelectorStrategy<
  HTMLTextAreaElement | HTMLDivElement
> {
  return {
    name: 'text-match-caption-input',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const textareas = dialog.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (isVisible(ta) && hasTextMatch(ta, SAY_TEXTS)) {
          return ta;
        }
      }

      const editables = dialog.querySelectorAll('[contenteditable="true"]');
      for (const ed of editables) {
        if (isVisible(ed) && hasTextMatch(ed, SAY_TEXTS)) {
          return ed as HTMLDivElement;
        }
      }

      // Fallback: any visible textarea
      for (const ta of textareas) {
        if (isVisible(ta)) return ta;
      }
      return null;
    },
    validate: el => isVisible(el) && (hasTextMatch(el, SAY_TEXTS) || el.tagName === 'TEXTAREA'),
  };
}

export function createFirstCommentInputStrategy(): SelectorStrategy<HTMLTextAreaElement> {
  return {
    name: 'text-match-first-comment-input',
    select: (root: Document | Element) => {
      const dialog = root.querySelector('[role="dialog"]');
      if (!dialog) return null;

      const textareas = dialog.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (isVisible(ta) && hasTextMatch(ta, COMMENT_TEXTS)) {
          return ta;
        }
      }
      return null;
    },
    validate: el =>
      isVisible(el) && !el.disabled && !el.readOnly && hasTextMatch(el, COMMENT_TEXTS),
  };
}

export function createGroupFeedItemStrategy(): SelectorStrategy<Element[]> {
  return {
    name: 'text-match-group-feed-item',
    select: (root: Document | Element) => {
      const listitems = root.querySelectorAll('[role="listitem"]');
      const groupItems: Element[] = [];

      for (const item of listitems) {
        // Check if this item contains a group link
        const link = item.querySelector('a[href*="/groups/"]');
        if (link && isVisible(item)) {
          groupItems.push(item);
        }
      }

      return groupItems.length > 0 ? groupItems : Array.from(listitems);
    },
    validate: els => els.length > 0,
  };
}

export function createGroupNameStrategy(): SelectorStrategy<string> {
  return {
    name: 'text-match-group-name',
    select: (root: Document | Element) => {
      // In a group item, the name is usually the most prominent text
      const candidates = root.querySelectorAll(
        '[role="heading"], strong, h3, h4, [dir="auto"], span[dir="auto"]'
      );

      for (const el of candidates) {
        const text = el.textContent?.trim() || '';
        if (text.length > 1 && text.length < 100 && !text.includes('\n') && isVisible(el)) {
          // Skip if it looks like metadata (member count, etc.)
          if (!/\d+\s*(member|people|person)/i.test(text)) {
            return text;
          }
        }
      }

      // Fallback: any visible text in the item that looks like a name
      const allText = root.textContent?.trim() || '';
      const lines = allText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 1 && l.length < 100);
      for (const line of lines) {
        if (!/\d+\s*(member|people|person)/i.test(line)) return line;
      }

      return '';
    },
    validate: name => name.length > 1,
  };
}

export function createGroupLinkStrategy(): SelectorStrategy<string> {
  return {
    name: 'text-match-group-link',
    select: (root: Document | Element) => {
      const link = root.querySelector('a[href*="/groups/"]') as HTMLAnchorElement;
      return link?.href || '';
    },
    validate: url => url.includes('/groups/'),
  };
}

export function createPostAuthorStrategy(): SelectorStrategy<{ name: string; url: string }> {
  return {
    name: 'text-match-post-author',
    select: (root: Document | Element) => {
      const authorLink = root.querySelector(
        'a[href*="/user/"], a[href*="/profile/"]'
      ) as HTMLAnchorElement;
      if (authorLink) {
        let name = authorLink.textContent?.trim() || '';
        if (!name) {
          const strong = authorLink.querySelector('strong');
          name = strong?.textContent?.trim() || '';
        }
        if (name) return { name, url: authorLink.href };
      }
      return { name: '', url: '' };
    },
    validate: author => author.name.length > 0 && author.url.length > 0,
  };
}

export function createPostTextStrategy(): SelectorStrategy<string> {
  return {
    name: 'text-match-post-text',
    select: (root: Document | Element) => {
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
    name: 'text-match-post-images',
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
    name: 'text-match-post-url',
    select: (root: Document | Element) => {
      const link = root.querySelector(
        'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]'
      ) as HTMLAnchorElement;
      return link?.href || '';
    },
    validate: url => url.includes('facebook.com'),
  };
}
