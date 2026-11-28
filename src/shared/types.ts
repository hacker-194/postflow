/**
 * Domain Types — Source of Truth for the entire extension
 * All other modules import types from here.
 */

export type Platform = 'facebook' | 'whatsapp' | 'messenger';

export type ShareMode = 'share_original' | 'repost_content';

export interface Group {
  id: string;
  name: string;
  url: string;
  platform: Platform;
  memberCount?: number;
  isAdmin?: boolean;
  category?: string;
  addedAt: number;
  lastPostedAt?: number;
}

export interface GroupList {
  id: string;
  name: string;
  groupIds: string[];
  color: string;
  platform: Platform;
  createdAt: number;
  updatedAt: number;
}

export interface ShareModeSettings {
  mode: ShareMode;
}

export interface ShareSettings {
  mode: ShareMode;
  caption: string;
  firstComment?: string;
  useSpintax: boolean;
  spintaxVariations?: string[];
  imageSetIds?: string[];
  backgroundColor?: string;
  delayBetweenGroups: number;
  safetyLevel: SafetyLevel;
  overnightPause: boolean;
  overnightStart: string; // HH:MM
  overnightEnd: string; // HH:MM
  maxPostsPerDay: number;
}

export type SafetyLevel = 'fast' | 'balanced' | 'safe';

export interface ScheduledShare {
  id: string;
  postUrl: string;
  postPreview: PostPreview;
  groupListId: string;
  /** Exact groups picked in the share sheet; wins over groupListId when set. */
  groupIds?: string[];
  settings: ShareSettings;
  scheduledAt: number;
  createdAt: number;
  status: ShareJobStatus;
  progress?: ShareProgress;
  checkpoint?: JobCheckpoint;
}

export type ShareJobStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface PostPreview {
  url: string;
  authorName: string;
  authorProfileUrl: string;
  text: string;
  images: string[];
  videoUrl?: string;
  isReel: boolean;
  isVideo: boolean;
  postedAt: number;
}

export interface ShareProgress {
  totalGroups: number;
  completedGroups: number;
  successfulGroups: number;
  failedGroups: number;
  currentGroupId?: string;
  currentGroupName?: string;
  errors: ShareError[];
  startedAt: number;
  estimatedCompletionAt?: number;
}

export interface ShareError {
  groupId: string;
  groupName: string;
  error: string;
  timestamp: number;
  retryable: boolean;
}

export interface ShareResult {
  id: string;
  postUrl: string;
  groupListId: string;
  settings: ShareSettings;
  progress: ShareProgress;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  isFreeShare: boolean;
}

export interface ImageSet {
  id: string;
  name: string;
  imageUrls: string[];
  createdAt: number;
}

export interface Template {
  id: string;
  name: string;
  caption: string;
  firstComment?: string;
  settings: Partial<ShareSettings>;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  showShareButton: boolean;
  shareButtonPosition: 'after_share' | 'before_share' | 'floating';
  autoDetectGroups: boolean;
  confirmBeforeShare: boolean;
  soundNotifications: boolean;
  desktopNotifications: boolean;
  analyticsOptIn: boolean;
  plan: 'free' | 'pro';
}

export interface StorageSchema {
  groups: Record<string, Group>;
  groupLists: Record<string, GroupList>;
  scheduledShares: Record<string, ScheduledShare>;
  shareHistory: Record<string, ShareResult>;
  imageSets: Record<string, ImageSet>;
  templates: Record<string, Template>;
  userSettings: UserSettings;
  dailyPosts: number;
  dailyPostsDate: string;
  freeSharesUsed: number;
  fbSession?: {
    userId: string;
    name: string;
    profilePic: string;
    expiresAt: number;
  };
  jobCheckpoints: Record<string, JobCheckpoint>;
}

export interface JobCheckpoint {
  shareId: string;
  jobState: ShareJobState;
  completedGroups: GroupResult[];
  currentGroupIndex: number;
  updatedAt: number;
}

export interface GroupResult {
  groupId: string;
  groupName: string;
  success: boolean;
  error?: string;
  timestamp: number;
}

// State machine types
export type ShareJobState =
  | { status: 'queued'; scheduledAt: number }
  | { status: 'opening'; startedAt: number }
  | { status: 'selecting-group'; groupId: string; attempt: number }
  | { status: 'captioning'; groupId: string }
  | { status: 'posting'; groupId: string }
  | { status: 'verifying'; groupId: string }
  | { status: 'done'; completedAt: number; results: GroupResult[] }
  | { status: 'failed'; reason: FailureReason; failedAt: number; partialResults: GroupResult[] }
  | { status: 'interrupted'; reason: 'sw-restart' | 'browser-close'; checkpoint: JobCheckpoint };

export type FailureReason =
  | 'captcha'
  | 'checkpoint'
  | 'rate-limit'
  | 'temporarily-blocked'
  | 'sharing-disabled'
  | 'admin-approval-required'
  | 'unexpected-dialog'
  | 'network-error'
  | 'group-not-found'
  | 'share-dialog-failed'
  | 'post-button-failed'
  | 'daily-limit-reached'
  | 'user-cancelled'
  | 'unknown';

export interface StateEvent {
  type:
    | 'alarm-tick'
    | 'share-dialog-opened'
    | 'group-selected'
    | 'caption-set'
    | 'post-clicked'
    | 'success'
    | 'all-groups-done'
    | 'anomaly-detected'
    | 'sw-restart';
  payload?: unknown;
}

// Message types
export type BackgroundMessageType =
  | 'SCHEDULE_SHARE'
  | 'CANCEL_SHARE'
  | 'GET_SHARE_PROGRESS'
  | 'GET_DAILY_POSTS'
  | 'SYNC_GROUPS'
  | 'SYNC_WHATSAPP_GROUPS'
  | 'SYNC_MESSENGER_GROUPS'
  | 'GET_ALL_GROUPS'
  | 'GET_GROUP_LISTS'
  | 'GET_GROUPS_FOR_LIST'
  | 'GET_TEMPLATES'
  | 'GET_IMAGE_SETS'
  | 'GET_ALL_SCHEDULED'
  | 'GET_SHARE_HISTORY'
  | 'GET_USER_SETTINGS'
  | 'UPDATE_USER_SETTINGS'
  | 'SAVE_GROUP'
  | 'DELETE_GROUP'
  | 'SAVE_GROUP_LIST'
  | 'DELETE_GROUP_LIST'
  | 'SAVE_TEMPLATE'
  | 'DELETE_TEMPLATE'
  | 'SAVE_IMAGE_SET'
  | 'DELETE_IMAGE_SET'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'CLEAR_ALL_DATA'
  | 'GET_WHATSAPP_GROUPS'
  | 'GET_MESSENGER_GROUPS'
  | 'GET_CURRENT_MESSAGE'
  | 'PERFORM_SHARE'
  | 'SHARE_PROGRESS'
  | 'PLAY_SOUND';

export interface BackgroundMessage<T = unknown> {
  type: BackgroundMessageType;
  payload?: T;
  shareId?: string;
  listId?: string;
  id?: string;
  settings?: Partial<UserSettings>;
  data?: string;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  groups?: Array<{ id: string; name: string; url?: string; memberCount?: number }>;
}

// Adapter types
export interface RawGroup {
  id: string;
  name: string;
  url: string;
  memberCount?: number;
}

export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  strategyUsed?: string;
}

export interface ShareResultData {
  success: boolean;
  error?: string;
  anomaly?: Anomaly;
}

export interface Anomaly {
  type: AnomalyType;
  message: string;
  recoverable: boolean;
  selector?: string;
}

export type AnomalyType =
  | 'captcha'
  | 'checkpoint'
  | 'rate-limit'
  | 'temporarily-blocked'
  | 'sharing-disabled'
  | 'admin-approval-required'
  | 'unexpected-dialog'
  | 'network-error';
