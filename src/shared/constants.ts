/**
 * Constants — Safety levels, delays, limits, defaults
 * Single source of truth for all magic numbers.
 */

import type { ShareSettings, UserSettings, SafetyLevel } from './types';

export const SAFETY_LEVEL_DELAYS = {
  fast: { min: 10_000, max: 20_000 }, // 10-20s jitter
  balanced: { min: 30_000, max: 60_000 }, // 30-60s jitter
  safe: { min: 90_000, max: 180_000 }, // 90-180s jitter
} as const satisfies Record<SafetyLevel, { min: number; max: number }>;

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  mode: 'share_original',
  caption: '',
  firstComment: '',
  useSpintax: false,
  delayBetweenGroups: 60_000, // 1 minute base
  safetyLevel: 'safe',
  overnightPause: true,
  overnightStart: '22:00',
  overnightEnd: '07:00',
  maxPostsPerDay: 20,
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  showShareButton: true,
  shareButtonPosition: 'after_share',
  autoDetectGroups: true,
  confirmBeforeShare: true,
  soundNotifications: true,
  desktopNotifications: true,
  analyticsOptIn: false,
  plan: 'free',
};

export const STORAGE_PREFIX = 'fgp';
export const ALARM_NAME = 'fgp-scheduler';
export const ALARM_PERIOD_MINUTES = 1;

export const FREE_PLAN_MONTHLY_LIMIT = 6;
export const MAX_DAILY_POSTS_HARD_LIMIT = 500;

export const SELECTOR_VERSION = '2025-01-15';

export const SHARE_BUTTON_SELECTORS = [
  '[data-testid="share-button"]',
  '[role="button"][aria-label*="Share" i]',
  '[role="button"][aria-label*="Compartir" i]',
  '[role="button"][aria-label*="Partager" i]',
  '[role="button"][aria-label*="Teilen" i]',
] as const;

export const SHARE_DIALOG_SELECTORS = [
  '[role="dialog"]:has-text("Share" i)',
  '[role="dialog"]:has-text("Compartir" i)',
  '[role="dialog"]:has-text("Partager" i)',
  '[role="dialog"]:has-text("Teilen" i)',
  '[data-testid="share-dialog"]',
] as const;

export const GROUP_INPUT_SELECTORS = [
  'input[placeholder*="group" i]',
  'input[aria-label*="group" i]',
  'input[data-testid*="group" i]',
  'input[placeholder*="grupo" i]',
  'input[placeholder*="groupe" i]',
  'input[placeholder*="gruppe" i]',
] as const;

export const POST_BUTTON_SELECTORS = [
  '[role="button"]:has-text("Post" i)',
  '[role="button"]:has-text("Share" i)',
  '[role="button"]:has-text("Publicar" i)',
  '[role="button"]:has-text("Partager" i)',
  '[role="button"]:has-text("Posten" i)',
  '[data-testid="share-button-post"]',
] as const;

export const CAPTION_INPUT_SELECTORS = [
  'textarea[placeholder*="say" i]',
  'textarea[placeholder*="escribe" i]',
  'textarea[placeholder*="écris" i]',
  'textarea[placeholder*="schreib" i]',
  '[contenteditable="true"][data-testid*="caption"]',
  '[contenteditable="true"][role="textbox"]',
] as const;

export const FIRST_COMMENT_SELECTORS = [
  'textarea[placeholder*="comment" i]',
  'textarea[placeholder*="comentario" i]',
  'textarea[placeholder*="commentaire" i]',
  'textarea[placeholder*="kommentar" i]',
] as const;

// Group feed extraction
export const GROUP_FEED_ITEM_SELECTORS = [
  '[role="listitem"]',
  '[data-testid="group-card"]',
  '[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]',
  'div[role="article"]',
] as const;

export const GROUP_NAME_SELECTORS = [
  '[role="heading"]',
  'strong',
  '[data-testid="group-name"]',
  '[dir="auto"]',
  'h3',
  'h4',
] as const;

export const GROUP_LINK_SELECTORS = [
  'a[href*="/groups/"]',
  'a[href*="facebook.com/groups/"]',
] as const;

// Post preview extraction
export const POST_AUTHOR_SELECTORS = [
  'a[href*="/user/"]',
  'a[href*="/profile/"]',
  '[role="heading"] strong',
  'strong.x1lliihq',
] as const;

export const POST_TEXT_SELECTORS = [
  '[data-testid="post_message"]',
  '[data-ad-comet-preview="message"]',
  '.x1iorvi4',
  '[data-testid="post-message"]',
] as const;

export const IMAGE_SELECTORS = ['img[src*="scontent"]', 'img[src*="fbcdn"]'] as const;

export const POST_URL_SELECTORS = [
  'a[href*="/posts/"]',
  'a[href*="/videos/"]',
  'a[href*="/reel/"]',
] as const;

// Anomaly detection
export const ANOMALY_SELECTORS = {
  captcha: [
    'iframe[src*="captcha" i]',
    'div[id*="captcha" i]',
    ':has-text("Enter the code" i)',
    ':has-text("Security check" i)',
    ':has-text("Verify you are human" i)',
  ],
  checkpoint: [
    ':has-text("Checkpoint" i)',
    ':has-text("Verify your identity" i)',
    ':has-text("Security check" i)',
    '[data-testid="checkpoint"]',
  ],
  rateLimit: [
    ':has-text("temporarily blocked" i)',
    ':has-text("too many" i)',
    ':has-text("rate limit" i)',
    ':has-text("slow down" i)',
    ':has-text("try again later" i)',
  ],
  sharingDisabled: [
    ':has-text("sharing not allowed" i)',
    ':has-text("can\'t share" i)',
    ':has-text("disabled for this group" i)',
    ':has-text("not allowed to share" i)',
  ],
  adminApproval: [
    ':has-text("pending admin approval" i)',
    ':has-text("awaiting review" i)',
    ':has-text("admin approval" i)',
  ],
} as const;
