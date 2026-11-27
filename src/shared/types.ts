export type Platform = 'facebook' | 'whatsapp' | 'messenger';

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

export type ShareMode = 'share_original' | 'repost_content';

export interface ShareSettings {
  mode: ShareMode;
  caption: string;
  firstComment?: string;
  useSpintax: boolean;
  spintaxVariations?: string[];
  imageSetIds?: string[];
  backgroundColor?: string;
  delayBetweenGroups: number;
  safetyLevel: 'fast' | 'balanced' | 'safe';
  overnightPause: boolean;
  overnightStart: string;
  overnightEnd: string;
  maxPostsPerDay: number;
}

export interface ScheduledShare {
  id: string;
  postUrl: string;
  postPreview: PostPreview;
  groupListId: string;
  settings: ShareSettings;
  scheduledAt: number;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: ShareProgress;
}

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
  fbSession?: {
    userId: string;
    name: string;
    profilePic: string;
    expiresAt: number;
  };
}

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  mode: 'share_original',
  caption: '',
  firstComment: '',
  useSpintax: false,
  delayBetweenGroups: 30000,
  safetyLevel: 'balanced',
  overnightPause: true,
  overnightStart: '22:00',
  overnightEnd: '07:00',
  maxPostsPerDay: 200,
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
};

export const SAFETY_LEVEL_DELAYS = {
  fast: { min: 10000, max: 20000 },
  balanced: { min: 30000, max: 60000 },
  safe: { min: 90000, max: 180000 },
} as const;
