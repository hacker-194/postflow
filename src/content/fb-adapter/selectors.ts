/**
 * Versioned Selector Registry
 * Single source of truth for all Facebook DOM selectors.
 * Update CURRENT_VERSION when FB redesigns.
 */

import type { AnomalyType } from '../../shared/types';

export const SELECTOR_VERSION = '2025-01-15';

export interface SelectorSet {
  shareButton: string[];
  shareDialog: string[];
  groupInput: string[];
  postButton: string[];
  captionInput: string[];
  firstCommentInput: string[];
  groupFeedItem: string[];
  groupName: string[];
  groupLink: string[];
  postAuthor: string[];
  postText: string[];
  postImages: string[];
  postUrl: string[];
}

export const SELECTORS: Record<string, SelectorSet> = {
  v1: {
    shareButton: [
      '[data-testid="share-button"]',
      '[role="button"][aria-label*="Share" i]',
      '[role="button"][aria-label*="Compartir" i]',
      '[role="button"][aria-label*="Partager" i]',
      '[role="button"][aria-label*="Teilen" i]',
      '[role="button"][aria-label*="Condividi" i]',
      '[role="button"][aria-label*="分享" i]',
      '[role="button"][aria-label*="공유" i]',
      '[role="button"][aria-label*="Paylaş" i]',
      '[role="button"][aria-label*="Partilhar" i]',
    ],
    shareDialog: [
      '[role="dialog"]:has-text("Share" i)',
      '[role="dialog"]:has-text("Compartir" i)',
      '[role="dialog"]:has-text("Partager" i)',
      '[role="dialog"]:has-text("Teilen" i)',
      '[role="dialog"]:has-text("Condividi" i)',
      '[role="dialog"]:has-text("分享" i)',
      '[role="dialog"]:has-text("공유" i)',
      '[role="dialog"]:has-text("Paylaş" i)',
      '[role="dialog"]:has-text("Partilhar" i)',
      '[data-testid="share-dialog"]',
      '[role="dialog"][aria-label*="Share" i]',
    ],
    groupInput: [
      'input[placeholder*="group" i]',
      'input[aria-label*="group" i]',
      'input[data-testid*="group" i]',
      'input[placeholder*="grupo" i]',
      'input[placeholder*="groupe" i]',
      'input[placeholder*="gruppe" i]',
      'input[placeholder*="gruppo" i]',
      'input[placeholder*="群组" i]',
      'input[placeholder*="그룹" i]',
      'input[placeholder*="grup" i]',
      'input[placeholder*="grupo" i]',
    ],
    postButton: [
      '[role="button"]:has-text("Post" i)',
      '[role="button"]:has-text("Share" i)',
      '[role="button"]:has-text("Publicar" i)',
      '[role="button"]:has-text("Partager" i)',
      '[role="button"]:has-text("Posten" i)',
      '[role="button"]:has-text("Pubblicare" i)',
      '[role="button"]:has-text("发布" i)',
      '[role="button"]:has-text("게시" i)',
      '[role="button"]:has-text("Paylaş" i)',
      '[role="button"]:has-text("Publicar" i)',
      '[data-testid="share-button-post"]',
      '[data-testid="composer-post-button"]',
    ],
    captionInput: [
      'textarea[placeholder*="say" i]',
      'textarea[placeholder*="escribe" i]',
      'textarea[placeholder*="écris" i]',
      'textarea[placeholder*="schreib" i]',
      'textarea[placeholder*="scrivi" i]',
      'textarea[placeholder*="写" i]',
      'textarea[placeholder*="써" i]',
      'textarea[placeholder*="yaz" i]',
      'textarea[placeholder*="escreva" i]',
      '[contenteditable="true"][data-testid*="caption"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="say" i]',
    ],
    firstCommentInput: [
      'textarea[placeholder*="comment" i]',
      'textarea[placeholder*="comentario" i]',
      'textarea[placeholder*="commentaire" i]',
      'textarea[placeholder*="kommentar" i]',
      'textarea[placeholder*="commento" i]',
      'textarea[placeholder*="评论" i]',
      'textarea[placeholder*="댓글" i]',
      'textarea[placeholder*="yorum" i]',
      'textarea[placeholder*="comentário" i]',
    ],
    groupFeedItem: [
      '[role="listitem"]',
      '[data-testid="group-card"]',
      '[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]',
      'div[role="article"]',
      '.x1yztbdb',
      '.x1n2onr6',
      '.x78zum5',
      '.x1q0g3np',
      '.x1iyjqo2',
    ],
    groupName: [
      '[role="heading"]',
      'strong',
      '[data-testid="group-name"]',
      '[dir="auto"]',
      'h3',
      'h4',
      '.x1lliihq',
      'span[dir="auto"]',
    ],
    groupLink: ['a[href*="/groups/"]', 'a[href*="facebook.com/groups/"]'],
    postAuthor: [
      'a[href*="/user/"]',
      'a[href*="/profile/"]',
      '[role="heading"] strong',
      'strong.x1lliihq',
      'h2 strong',
      'h3 strong',
      'strong[dir="auto"]',
    ],
    postText: [
      '[data-testid="post_message"]',
      '[data-ad-comet-preview="message"]',
      '.x1iorvi4',
      '[data-testid="post-message"]',
      'div[data-testid="post_message"]',
    ],
    postImages: ['img[src*="scontent"]', 'img[src*="fbcdn"]'],
    postUrl: [
      'a[href*="/posts/"]',
      'a[href*="/videos/"]',
      'a[href*="/reel/"]',
      'a[href*="/photo/"]',
    ],
  },
};

export type SelectorVersion = keyof typeof SELECTORS;

export const CURRENT_VERSION: SelectorVersion = 'v1';

export function getSelectors(version: SelectorVersion = CURRENT_VERSION): SelectorSet {
  return SELECTORS[version] ?? SELECTORS[CURRENT_VERSION];
}

export const SHARE_BUTTON_SELECTORS = getSelectors().shareButton;
export const SHARE_DIALOG_SELECTORS = getSelectors().shareDialog;
export const GROUP_INPUT_SELECTORS = getSelectors().groupInput;
export const POST_BUTTON_SELECTORS = getSelectors().postButton;
export const CAPTION_INPUT_SELECTORS = getSelectors().captionInput;
export const FIRST_COMMENT_SELECTORS = getSelectors().firstCommentInput;
export const GROUP_FEED_ITEM_SELECTORS = getSelectors().groupFeedItem;
export const GROUP_NAME_SELECTORS = getSelectors().groupName;
export const GROUP_LINK_SELECTORS = getSelectors().groupLink;
export const POST_AUTHOR_SELECTORS = getSelectors().postAuthor;
export const POST_TEXT_SELECTORS = getSelectors().postText;
export const POST_IMAGES_SELECTORS = getSelectors().postImages;
export const POST_URL_SELECTORS = getSelectors().postUrl;

export const ANOMALY_SELECTORS: Record<AnomalyType, string[]> = {
  captcha: [
    'iframe[src*="captcha" i]',
    'div[id*="captcha" i]',
    ':has-text("Enter the code" i)',
    ':has-text("Security check" i)',
    ':has-text("Verify you are human" i)',
    ':has-text("请输入验证码" i)',
    ':has-text("보안 확인" i)',
    ':has-text("Güvenlik kontrolü" i)',
  ],
  checkpoint: [
    ':has-text("Checkpoint" i)',
    ':has-text("Verify your identity" i)',
    ':has-text("Security check" i)',
    '[data-testid="checkpoint"]',
    ':has-text("验证您的身份" i)',
    ':has-text("신원 확인" i)',
    ':has-text("Kimliğinizi doğrulayın" i)',
  ],
  'rate-limit': [
    ':has-text("temporarily blocked" i)',
    ':has-text("too many" i)',
    ':has-text("rate limit" i)',
    ':has-text("slow down" i)',
    ':has-text("try again later" i)',
    ':has-text("暂时被屏蔽" i)',
    ':has-text("일시적으로 차단" i)',
    ':has-text("geçici olarak engellendi" i)',
  ],
  'temporarily-blocked': [
    ':has-text("temporarily blocked" i)',
    ':has-text("you can\'t share" i)',
    ':has-text("action blocked" i)',
    ':has-text("暂时无法分享" i)',
    ':has-text("일시적으로 공유 불가" i)',
  ],
  'sharing-disabled': [
    ':has-text("sharing not allowed" i)',
    ':has-text("can\'t share" i)',
    ':has-text("disabled for this group" i)',
    ':has-text("not allowed to share" i)',
    ':has-text("此群组不允许分享" i)',
    ':has-text("이 그룹에서는 공유할 수 없음" i)',
  ],
  'admin-approval-required': [
    ':has-text("pending admin approval" i)',
    ':has-text("awaiting review" i)',
    ':has-text("admin approval" i)',
    ':has-text("waiting for admin" i)',
    ':has-text("等待管理员审批" i)',
    ':has-text("관리자 승인 대기" i)',
  ],
  'unexpected-dialog': [
    '[role="dialog"]:not(:has-text("Share" i)):not(:has-text("Compartir" i)):not(:has-text("Partager" i)):not(:has-text("Teilen" i))',
  ],
  'network-error': [],
};
