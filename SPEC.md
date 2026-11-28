# SPEC.md — Free Group Poster (Reference Implementation)

> **Note:** This spec documents the existing open-source `free-group-poster` project as a reference. The commercial "MultiGroupPoster" was not available for analysis.

---

## 1. Product Overview

**Name:** Free Group Poster (branded as "PostFlow")
**Type:** Chrome Extension (Manifest V3)
**Purpose:** Add a "Share to Groups" button under Facebook posts; share to multiple user-owned Facebook groups sequentially with scheduling, safety delays, and caption features.
**License:** MIT (open-source)
**Privacy:** Local-only, no telemetry, no remote code, no accounts, no analytics

---

## 2. Core User Flows

### 2.1 First-Time Setup

1. User installs extension → `onInstalled` → `initializeDefaults()` → opens options page
2. User navigates to `facebook.com/groups/feed/` → clicks "Sync Facebook Groups" in options
3. Content script extracts groups → stores in IndexedDB → user creates Group Lists (colored chips)
4. User configures safety level, overnight pause, daily limit in share sheet or options

### 2.2 Share Now (Immediate)

1. User browses Facebook → sees post → "Share to Groups" button injected near native Share button
2. User clicks button → Share Sheet modal opens with post preview
3. User selects share mode: **Share original** (default) or **Post as me** (copy content)
4. User optionally adds caption (supports `{opt1|opt2}` spintax syntax) and first comment
5. User selects Group List → sees groups as checkboxes → selects target groups
6. User adjusts safety level (Fast/Balanced/Safe), overnight pause, daily limit
7. User clicks "Share Now" → `SCHEDULE_SHARE` with `scheduledAt: now` → background queues job
8. Background service worker picks up job (within 1 min via alarm) → executes sequentially
9. Progress broadcast via `SHARE_PROGRESS` → popup shows running status
10. On completion/failure → notification + history entry

### 2.3 Schedule for Later

- Same as Share Now, but user clicks "Schedule" → enters date/time or "in X minutes/hours"
- Job stored with future `scheduledAt` → alarm processes when due

### 2.4 Group Management

- Options page: Groups tab → "Sync Facebook Groups" (requires FB Groups feed open)
- Create/edit/delete Group Lists (name, color, platform, member groups)
- Templates tab: save caption + settings combos for reuse
- Images tab: save image sets for rotation (UI only, not wired to share)

### 2.5 Monitoring

- Popup: Dashboard (stats), Lists, Scheduled (pending/running), History (success/failed), Settings
- Auto-refresh every 10s
- Export/Import full JSON backup
- Clear all data

---

## 3. Data Model (from `src/shared/types.ts`)

```typescript
// Core entities
Group { id, name, url, platform, memberCount?, isAdmin?, category?, addedAt, lastPostedAt? }
GroupList { id, name, groupIds[], color, platform, createdAt, updatedAt }
ShareMode: 'share_original' | 'repost_content'

ShareSettings {
  mode: ShareMode
  caption: string
  firstComment?: string
  useSpintax: boolean
  spintaxVariations?: string[]
  imageSetIds?: string[]
  backgroundColor?: string
  delayBetweenGroups: number      // base delay (ms)
  safetyLevel: 'fast' | 'balanced' | 'safe'
  overnightPause: boolean
  overnightStart: string          // HH:MM
  overnightEnd: string            // HH:MM
  maxPostsPerDay: number
}

ScheduledShare {
  id, postUrl, postPreview, groupListId, settings, scheduledAt, createdAt
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: ShareProgress
}

PostPreview { url, authorName, authorProfileUrl, text, images[], videoUrl?, isReel, isVideo, postedAt }

ShareProgress { totalGroups, completedGroups, successfulGroups, failedGroups, currentGroupId?, currentGroupName?, errors[], startedAt, estimatedCompletionAt? }

ShareError { groupId, groupName, error, timestamp, retryable }

ShareResult { id, postUrl, groupListId, settings, progress, startedAt, completedAt?, status, isFreeShare }

ImageSet { id, name, imageUrls[], createdAt }

Template { id, name, caption, firstComment?, settings: Partial<ShareSettings>, createdAt, updatedAt }

UserSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  showShareButton: boolean
  shareButtonPosition: 'after_share' | 'before_share' | 'floating'
  autoDetectGroups: boolean
  confirmBeforeShare: boolean
  soundNotifications: boolean
  desktopNotifications: boolean
  analyticsOptIn: boolean
  plan: 'free' | 'pro'          // free = 6 shares/month
}
```

---

## 4. Message Contract (Background ↔ Content/Popup/Options)

### Content → Background

- `SCHEDULE_SHARE(payload)` → `{success, shareId?, error?}`
- `GET_GROUP_LISTS` → `GroupList[]`
- `GET_GROUPS_FOR_LIST({listId})` → `{id,name}[]`
- `SYNC_GROUPS` → `{success, groups?: Group[], error?}`
- `GET_USER_SETTINGS` → `UserSettings`
- `PERFORM_SHARE({postUrl, groupId, settings, preview})` → `{success, error?}`

### Popup/Options → Background

- `GET_GROUP_LISTS`, `GET_ALL_SCHEDULED`, `GET_SHARE_HISTORY`, `GET_USER_SETTINGS`, `GET_DAILY_POSTS`
- `UPDATE_USER_SETTINGS({settings})` → `{success}`
- `SAVE_GROUP_LIST({list})`, `DELETE_GROUP_LIST({id})`
- `SAVE_TEMPLATE({template})`, `DELETE_TEMPLATE({id})`
- `SAVE_IMAGE_SET({imageSet})`, `DELETE_IMAGE_SET({id})`
- `EXPORT_DATA` → JSON string
- `IMPORT_DATA({data:string})` → `{success, error?}`
- `CLEAR_ALL_DATA` → `{success}`
- `SYNC_WHATSAPP_GROUPS`, `SYNC_MESSENGER_GROUPS`

### Background → Content (broadcast)

- `SHARE_PROGRESS({shareId, progress})`
- `PLAY_SOUND({sound})`

---

## 5. Key Algorithms

### 5.1 Delay & Jitter (`calculateDelay`)

```typescript
base = settings.delayBetweenGroups || 30000;
range = SAFETY_LEVEL_DELAYS[safetyLevel]; // fast: 10-20k, balanced: 30-60k, safe: 90-180k
jitter = random(range.min, range.max);
return base + jitter;
```

### 5.2 Overnight Pause (`isOvernightPause`, `waitForOvernightPauseEnd`)

- Parses HH:MM → minutes since midnight
- Handles overnight spans (start > end)
- Sleeps until end time (next day if passed)

### 5.3 Daily Counter Reset

- On each alarm tick: compare `dailyPostsDate` with today
- If different → reset `dailyPosts` to 0, update date

### 5.4 Group Extraction (Facebook)

- Iterates 9 item selectors → 7 name selectors → 2 link selectors
- Stops at first item selector yielding results
- Extracts ID from URL regex `groups/(\d+)` or `groups/([^/?]+)`
- Deduplicates by ID

### 5.5 Post Preview Extraction

- Fallback chains for each field (author, text, images, video, URL)
- Images filtered: must contain `scontent` or `fbcdn`, not profile/emoji, length > 50
- Video detection: `<video>` element + `/reel/` link check

---

## 6. Security & Sanitization (`src/shared/security.ts`)

| Function                                         | Purpose                                               |
| ------------------------------------------------ | ----------------------------------------------------- |
| `sanitizeHtml`                                   | Strip scripts, event handlers, dangerous tags         |
| `sanitizeUrl`                                    | Allowlist `https:` only, block `javascript:`, `data:` |
| `sanitizeCaption`                                | Length limit, HTML escape                             |
| `sanitizeComment`                                | Length limit, HTML escape                             |
| `sanitizeSettings`                               | Validate all ShareSettings fields, clamp numbers      |
| `sanitizeGroupList`                              | Validate GroupList structure                          |
| `sanitizeTemplate`                               | Validate Template structure                           |
| `sanitizeImageSet`                               | Validate ImageSet structure                           |
| `validateShareId` / `validateGroupListId` / etc. | UUID format check                                     |
| `generateSecureId(prefix)`                       | `prefix_<timestamp>_<random>`                         |

All user input sanitized before storage. Message allowlist (`VALID_MESSAGE_TYPES`) + sender ID verification.

---

## 7. Current Implementation Gaps (vs. Ideal Spec)

| Feature                      | Current               | Required                                           |
| ---------------------------- | --------------------- | -------------------------------------------------- |
| Shadow DOM share sheet       | ❌ Regular DOM        | ✅ Isolate from FB CSS                             |
| Spintax parsing              | ❌ Detection only     | ✅ Expand `{a                                      | b   | c}` → random choice |
| First comment posting        | ❌ UI only            | ✅ Implement in automation                         |
| CAPTCHA/checkpoint detection | ❌ None               | ✅ Stop job, alert user                            |
| Job resume after SW restart  | ❌ Stuck as `running` | ✅ Checkpoint progress, resume or mark interrupted |
| "Repost as me" mode          | ❌ UI only            | ✅ Create new post with copied content             |
| Video/Reel handling          | ⚠️ Same flow          | ✅ Detect & warn (share only)                      |
| E2E tests                    | ❌ Empty `e2e/`       | ✅ Playwright with saved HTML fixtures             |
| Selector resilience          | ⚠️ Multi-fallback     | ✅ `fb-adapter` module with strategies             |
| TypeScript strictness        | ⚠️ 25 `any` warnings  | ✅ Zero `any`                                      |

---

## 8. Build & Test Commands

```bash
npm run dev           # Dev build with watch
npm run build         # Production build → dist/
npm run preview       # Preview dist/
npm run lint          # ESLint (strict)
npm run lint:fix      # Auto-fix
npm run format        # Prettier
npm run format:check  # Check format
npm run test          # Vitest unit tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:e2e      # Playwright E2E (not implemented)
npm run test:e2e:ui   # Playwright UI
npm run prepare       # Husky git hooks
```

---

## 9. File Structure (Reference)

```
src/
├── background/index.ts      # Service worker — scheduling, sharing, messages
├── content/index.ts         # FB content script — injection, extraction, share sheet
├── content/whatsapp.ts      # WhatsApp group sync
├── content/messenger.ts     # Messenger group sync
├── popup/index.tsx          # React popup — dashboard, lists, scheduled, history, settings
├── options/index.tsx        # React options — groups, templates, images tabs
├── options/styles.css       # Design system (CSS custom properties)
├── shared/
│   ├── types.ts             # All interfaces, defaults, constants
│   ├── storage.ts           # IndexedDB wrapper (idb) + namespacing
│   ├── security.ts          # Sanitization & validation
│   ├── logger.ts            # Structured logging
│   ├── storage.test.ts      # Unit tests
│   └── security.test.ts     # Unit tests
├── test/setup.ts            # Vitest setup
public/
├── manifest.json            # MV3 manifest
├── icons/                   # 16/32/48/128 PNG
vite.config.ts               # Multi-entry build
tsconfig.json                # Strict TS
package.json                 # Deps & scripts
```

---

## 10. Acceptance Criteria for Phase 1

- [x] `ARCHITECTURE.md` documents manifest, architecture, messages, storage, content script, automation, groups, pacing, captions, network, fragile points
- [x] `SPEC.md` documents product overview, user flows, data model, message contract, algorithms, security, gaps, build commands
- [ ] User reviews and approves before Phase 2
