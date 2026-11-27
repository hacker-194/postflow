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

export function sanitizeSettings(input: any): any {
  const sanitized: any = {};
  if (input.mode && ['share_original', 'repost_content'].includes(input.mode)) {
    sanitized.mode = input.mode;
  }
  if (typeof input.caption === 'string') {
    sanitized.caption = sanitizeCaption(input.caption);
  }
  if (typeof input.firstComment === 'string') {
    sanitized.firstComment = sanitizeComment(input.firstComment);
  }
  if (typeof input.useSpintax === 'boolean') {
    sanitized.useSpintax = input.useSpintax;
  }
  if (typeof input.delayBetweenGroups === 'number') {
    sanitized.delayBetweenGroups = Math.max(5000, Math.min(input.delayBetweenGroups, 3600000));
  }
  if (input.safetyLevel && ['fast', 'balanced', 'safe'].includes(input.safetyLevel)) {
    sanitized.safetyLevel = input.safetyLevel;
  }
  if (typeof input.overnightPause === 'boolean') {
    sanitized.overnightPause = input.overnightPause;
  }
  if (typeof input.overnightStart === 'string' && /^\d{2}:\d{2}$/.test(input.overnightStart)) {
    sanitized.overnightStart = input.overnightStart;
  }
  if (typeof input.overnightEnd === 'string' && /^\d{2}:\d{2}$/.test(input.overnightEnd)) {
    sanitized.overnightEnd = input.overnightEnd;
  }
  if (
    typeof input.maxPostsPerDay === 'number' &&
    input.maxPostsPerDay >= 1 &&
    input.maxPostsPerDay <= 500
  ) {
    sanitized.maxPostsPerDay = input.maxPostsPerDay;
  }
  return sanitized;
}

export function sanitizeGroupList(input: any): any {
  const sanitized: any = {};
  if (typeof input.name === 'string') {
    sanitized.name = sanitizeGroupName(input.name);
  }
  if (Array.isArray(input.groupIds)) {
    sanitized.groupIds = input.groupIds.filter((id: string) => validateGroupId(id)).slice(0, 500);
  }
  if (typeof input.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(input.color)) {
    sanitized.color = input.color;
  }
  return sanitized;
}

export function sanitizeTemplate(input: any): any {
  const sanitized: any = {};
  if (typeof input.name === 'string') {
    sanitized.name = sanitizeTemplateName(input.name);
  }
  if (typeof input.caption === 'string') {
    sanitized.caption = sanitizeCaption(input.caption);
  }
  if (typeof input.firstComment === 'string') {
    sanitized.firstComment = sanitizeComment(input.firstComment);
  }
  sanitized.settings = sanitizeSettings(input.settings || {});
  return sanitized;
}

export function sanitizeImageSet(input: any): any {
  const sanitized: any = {};
  if (typeof input.name === 'string') {
    sanitized.name = sanitizeImageSetName(input.name);
  }
  if (Array.isArray(input.imageUrls)) {
    sanitized.imageUrls = input.imageUrls
      .filter((url: string) => validateImageUrl(url))
      .slice(0, 50);
  }
  return sanitized;
}

export function createSecureMessageHandler<T extends { type: string }>(
  validTypes: string[],
  handler: (message: T, sender: chrome.runtime.MessageSender) => Promise<any>
) {
  return async (
    message: T,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
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