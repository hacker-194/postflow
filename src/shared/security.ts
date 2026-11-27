import type { ShareSettings, GroupList, Template, ImageSet } from './types';

export function sanitizeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

export const escapeHtml = sanitizeHtml;

export function sanitizeUrl(input: string): string {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function sanitizeFilename(input: string): string {
  return input.replace(/[<>:\"/\\|?*\x00-\x1F]/g, '_').slice(0, 255);
}

export function validateGroupId(input: string): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(input);
}

export function validateGroupListId(input: string): boolean {
  return /^list_[a-zA-Z0-9_-]{1,100}$/.test(input);
}

export function validateTemplateId(input: string): boolean {
  return /^template_[a-zA-Z0-9_-]{1,100}$/.test(input);
}

export function validateImageSetId(input: string): boolean {
  return /^images_[a-zA-Z0-9_-]{1,100}$/.test(input);
}

export function validateShareId(input: string): boolean {
  return /^share_\d+_[a-zA-Z0-9]{1,50}$/.test(input);
}

export function sanitizeCaption(input: string): string {
  return input.slice(0, 5000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function sanitizeComment(input: string): string {
  return input.slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function sanitizeGroupName(input: string): string {
  return input
    .slice(0, 200)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

export function sanitizeTemplateName(input: string): string {
  return input
    .slice(0, 100)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

export function sanitizeImageSetName(input: string): string {
  return input
    .slice(0, 100)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

export function validateSpintax(input: string): { valid: boolean; error?: string } {
  let depth = 0;
  let inOption = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '{') {
      if (inOption) return { valid: false, error: 'Nested braces not allowed' };
      depth++;
      inOption = true;
    } else if (char === '}') {
      if (!inOption) return { valid: false, error: 'Unmatched closing brace' };
      depth--;
      inOption = false;
    } else if (char === '|' && inOption) {
      continue;
    }
  }

  if (depth !== 0) return { valid: false, error: 'Unclosed brace' };
  return { valid: true };
}

export function parseSpintax(input: string): string[] {
  const result: string[] = [''];
  let depth = 0;
  let currentOption = '';
  let options: string[] = [];

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '{' && depth === 0) {
      depth = 1;
      options = [];
      currentOption = '';
    } else if (char === '{' && depth > 0) {
      depth++;
      currentOption += char;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        options.push(currentOption);
        const newResult: string[] = [];
        for (const prefix of result) {
          for (const opt of options) {
            newResult.push(prefix + opt);
          }
        }
        result.length = 0;
        result.push(...newResult);
        currentOption = '';
        options = [];
      } else {
        currentOption += char;
      }
    } else if (char === '|' && depth === 1) {
      options.push(currentOption);
      currentOption = '';
    } else {
      if (depth > 0) {
        currentOption += char;
      } else {
        for (let j = 0; j < result.length; j++) {
          result[j] += char ?? '';
        }
      }
    }
  }

  return result.length > 0 ? result : [''];
}

export function getRandomSpintaxVariation(input: string): string {
  const variations = parseSpintax(input);
  return variations[Math.floor(Math.random() * variations.length)] ?? '';
}

export function validateImageUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    return validExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

export function validateFacebookUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return ['facebook.com', 'm.facebook.com', 'www.facebook.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function sanitizeSettings(input: unknown): Partial<ShareSettings> {
  const sanitized: Partial<ShareSettings> = {};
  const obj = input as Record<string, unknown>;
  if (obj.mode && ['share_original', 'repost_content'].includes(obj.mode as string)) {
    sanitized.mode = obj.mode as ShareSettings['mode'];
  }
  if (typeof obj.caption === 'string') {
    sanitized.caption = sanitizeCaption(obj.caption);
  }
  if (typeof obj.firstComment === 'string') {
    sanitized.firstComment = sanitizeComment(obj.firstComment);
  }
  if (typeof obj.useSpintax === 'boolean') {
    sanitized.useSpintax = obj.useSpintax;
  }
  if (typeof obj.delayBetweenGroups === 'number') {
    sanitized.delayBetweenGroups = Math.max(5000, Math.min(obj.delayBetweenGroups, 3600000));
  }
  if (obj.safetyLevel && ['fast', 'balanced', 'safe'].includes(obj.safetyLevel as string)) {
    sanitized.safetyLevel = obj.safetyLevel as ShareSettings['safetyLevel'];
  }
  if (typeof obj.overnightPause === 'boolean') {
    sanitized.overnightPause = obj.overnightPause;
  }
  if (typeof obj.overnightStart === 'string' && /^\d{2}:\d{2}$/.test(obj.overnightStart)) {
    sanitized.overnightStart = obj.overnightStart;
  }
  if (typeof obj.overnightEnd === 'string' && /^\d{2}:\d{2}$/.test(obj.overnightEnd)) {
    sanitized.overnightEnd = obj.overnightEnd;
  }
  if (
    typeof obj.maxPostsPerDay === 'number' &&
    obj.maxPostsPerDay >= 1 &&
    obj.maxPostsPerDay <= 500
  ) {
    sanitized.maxPostsPerDay = obj.maxPostsPerDay;
  }
  return sanitized;
}

export function sanitizeGroupList(input: unknown): Partial<GroupList> {
  const sanitized: Partial<GroupList> = {};
  const obj = input as Record<string, unknown>;
  if (typeof obj.name === 'string') {
    sanitized.name = sanitizeGroupName(obj.name);
  }
  if (Array.isArray(obj.groupIds)) {
    sanitized.groupIds = obj.groupIds
      .filter((id): id is string => typeof id === 'string' && validateGroupId(id))
      .slice(0, 500);
  }
  if (typeof obj.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(obj.color)) {
    sanitized.color = obj.color;
  }
  return sanitized;
}

export function sanitizeTemplate(input: unknown): Partial<Template> {
  const sanitized: Partial<Template> = {};
  const obj = input as Record<string, unknown>;
  if (typeof obj.name === 'string') {
    sanitized.name = sanitizeTemplateName(obj.name);
  }
  if (typeof obj.caption === 'string') {
    sanitized.caption = sanitizeCaption(obj.caption);
  }
  if (typeof obj.firstComment === 'string') {
    sanitized.firstComment = sanitizeComment(obj.firstComment);
  }
  sanitized.settings = sanitizeSettings(obj.settings ?? {});
  return sanitized;
}

export function sanitizeImageSet(input: unknown): Partial<ImageSet> {
  const sanitized: Partial<ImageSet> = {};
  const obj = input as Record<string, unknown>;
  if (typeof obj.name === 'string') {
    sanitized.name = sanitizeImageSetName(obj.name);
  }
  if (Array.isArray(obj.imageUrls)) {
    sanitized.imageUrls = obj.imageUrls
      .filter((url): url is string => typeof url === 'string' && validateImageUrl(url))
      .slice(0, 50);
  }
  return sanitized;
}

export function createSecureMessageHandler<T extends { type: string }>(
  validTypes: string[],
  handler: (message: T, sender: chrome.runtime.MessageSender) => Promise<unknown>
) {
  return async (
    message: T,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (!message || !message.type) {
      sendResponse({ success: false, error: 'Invalid message format' });
      return true;
    }

    if (!validTypes.includes(message.type)) {
      sendResponse({ success: false, error: 'Unknown message type' });
      return true;
    }

    if (sender.id !== chrome.runtime.id) {
      sendResponse({ success: false, error: 'Unauthorized sender' });
      return true;
    }

    try {
      const result = await handler(message, sender);
      sendResponse(result);
    } catch (error) {
      console.error('[FGP] Message handler error:', error);
      sendResponse({ success: false, error: 'Internal error' });
    }
    return true;
  };
}

export function generateSecureId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 15);
  return `${prefix}_${timestamp}_${random}`;
}

export function isSafeOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.origin === window.location.origin ||
      url.hostname === 'facebook.com' ||
      url.hostname.endsWith('.facebook.com')
    );
  } catch {
    return false;
  }
}
