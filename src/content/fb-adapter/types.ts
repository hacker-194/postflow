/**
 * fb-adapter specific types
 * Adapter internal types, separate from shared domain types
 */

import type {
  RawGroup,
  PostPreview,
  ShareSettings,
  Anomaly,
  ExtractionResult,
} from '../../shared/types';

export interface SelectorStrategy<T> {
  name: string;
  select(root: Document | Element): T | null;
  validate(result: T): boolean;
}

export interface StrategySet {
  shareButton: SelectorStrategy<HTMLButtonElement>;
  shareDialog: SelectorStrategy<HTMLDivElement>;
  groupInput: SelectorStrategy<HTMLInputElement>;
  postButton: SelectorStrategy<HTMLButtonElement>;
  captionInput: SelectorStrategy<HTMLTextAreaElement | HTMLDivElement>;
  firstCommentInput: SelectorStrategy<HTMLTextAreaElement>;
  groupFeedItem: SelectorStrategy<Element[]>;
  groupName: SelectorStrategy<string>;
  groupLink: SelectorStrategy<string>;
  postAuthor: SelectorStrategy<{ name: string; url: string }>;
  postText: SelectorStrategy<string>;
  postImages: SelectorStrategy<string[]>;
  postUrl: SelectorStrategy<string>;
}

export interface AdapterConfig {
  selectorVersion: string;
  strategies: ('aria-label' | 'structural' | 'text-match' | 'shadow-dom')[];
  timeout: number;
  retryAttempts: number;
}

export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  selectorVersion: '2025-01-15',
  strategies: ['aria-label', 'structural', 'text-match', 'shadow-dom'],
  timeout: 5000,
  retryAttempts: 3,
};

export interface GroupExtractionResult extends ExtractionResult<RawGroup[]> {
  strategyUsed: string;
  itemsExamined: number;
}

export interface PostExtractionResult extends ExtractionResult<PostPreview> {
  strategyUsed: string;
}

export interface ShareExecutionResult {
  success: boolean;
  error?: string;
  anomaly?: Anomaly;
  stepsCompleted: string[];
}

export interface PerformShareContext {
  postUrl: string;
  groupId: string;
  settings: ShareSettings;
  preview: PostPreview;
}

export type StrategyName = 'aria-label' | 'structural' | 'text-match' | 'shadow-dom';

export interface StrategyModule {
  createShareButtonStrategy: () => SelectorStrategy<HTMLButtonElement>;
  createShareDialogStrategy: () => SelectorStrategy<HTMLDivElement>;
  createGroupInputStrategy: () => SelectorStrategy<HTMLInputElement>;
  createPostButtonStrategy: () => SelectorStrategy<HTMLButtonElement>;
  createCaptionInputStrategy: () => SelectorStrategy<HTMLTextAreaElement | HTMLDivElement>;
  createFirstCommentInputStrategy: () => SelectorStrategy<HTMLTextAreaElement>;
  createGroupFeedItemStrategy: () => SelectorStrategy<Element[]>;
  createGroupNameStrategy: () => SelectorStrategy<string>;
  createGroupLinkStrategy: () => SelectorStrategy<string>;
  createPostAuthorStrategy: () => SelectorStrategy<{ name: string; url: string }>;
  createPostTextStrategy: () => SelectorStrategy<string>;
  createPostImagesStrategy: () => SelectorStrategy<string[]>;
  createPostUrlStrategy: () => SelectorStrategy<string>;
}

export const STRATEGY_MODULES: Record<StrategyName, () => Promise<StrategyModule>> = {
  'aria-label': () =>
    import('./strategies/aria-label').then(m => ({
      createShareButtonStrategy: m.createShareButtonStrategy,
      createShareDialogStrategy: m.createShareDialogStrategy,
      createGroupInputStrategy: m.createGroupInputStrategy,
      createPostButtonStrategy: m.createPostButtonStrategy,
      createCaptionInputStrategy: m.createCaptionInputStrategy,
      createFirstCommentInputStrategy: m.createFirstCommentInputStrategy,
      createGroupFeedItemStrategy: m.createGroupFeedItemStrategy,
      createGroupNameStrategy: m.createGroupNameStrategy,
      createGroupLinkStrategy: m.createGroupLinkStrategy,
      createPostAuthorStrategy: m.createPostAuthorStrategy,
      createPostTextStrategy: m.createPostTextStrategy,
      createPostImagesStrategy: m.createPostImagesStrategy,
      createPostUrlStrategy: m.createPostUrlStrategy,
    })),
  structural: () =>
    import('./strategies/structural').then(m => ({
      createShareButtonStrategy: m.createShareButtonStrategy,
      createShareDialogStrategy: m.createShareDialogStrategy,
      createGroupInputStrategy: m.createGroupInputStrategy,
      createPostButtonStrategy: m.createPostButtonStrategy,
      createCaptionInputStrategy: m.createCaptionInputStrategy,
      createFirstCommentInputStrategy: m.createFirstCommentInputStrategy,
      createGroupFeedItemStrategy: m.createGroupFeedItemStrategy,
      createGroupNameStrategy: m.createGroupNameStrategy,
      createGroupLinkStrategy: m.createGroupLinkStrategy,
      createPostAuthorStrategy: m.createPostAuthorStrategy,
      createPostTextStrategy: m.createPostTextStrategy,
      createPostImagesStrategy: m.createPostImagesStrategy,
      createPostUrlStrategy: m.createPostUrlStrategy,
    })),
  'text-match': () =>
    import('./strategies/text-match').then(m => ({
      createShareButtonStrategy: m.createShareButtonStrategy,
      createShareDialogStrategy: m.createShareDialogStrategy,
      createGroupInputStrategy: m.createGroupInputStrategy,
      createPostButtonStrategy: m.createPostButtonStrategy,
      createCaptionInputStrategy: m.createCaptionInputStrategy,
      createFirstCommentInputStrategy: m.createFirstCommentInputStrategy,
      createGroupFeedItemStrategy: m.createGroupFeedItemStrategy,
      createGroupNameStrategy: m.createGroupNameStrategy,
      createGroupLinkStrategy: m.createGroupLinkStrategy,
      createPostAuthorStrategy: m.createPostAuthorStrategy,
      createPostTextStrategy: m.createPostTextStrategy,
      createPostImagesStrategy: m.createPostImagesStrategy,
      createPostUrlStrategy: m.createPostUrlStrategy,
    })),
  'shadow-dom': () =>
    import('./strategies/shadow-dom').then(m => ({
      createShareButtonStrategy: m.createShareButtonStrategy,
      createShareDialogStrategy: m.createShareDialogStrategy,
      createGroupInputStrategy: m.createGroupInputStrategy,
      createPostButtonStrategy: m.createPostButtonStrategy,
      createCaptionInputStrategy: m.createCaptionInputStrategy,
      createFirstCommentInputStrategy: m.createFirstCommentInputStrategy,
      createGroupFeedItemStrategy: m.createGroupFeedItemStrategy,
      createGroupNameStrategy: m.createGroupNameStrategy,
      createGroupLinkStrategy: m.createGroupLinkStrategy,
      createPostAuthorStrategy: m.createPostAuthorStrategy,
      createPostTextStrategy: m.createPostTextStrategy,
      createPostImagesStrategy: m.createPostImagesStrategy,
      createPostUrlStrategy: m.createPostUrlStrategy,
    })),
};
