# Architecture Document — Free Group Poster (Reference Implementation)

> **Note:** This documents the existing open-source `free-group-poster` project in this directory as a reference architecture. The commercial "MultiGroupPoster" extension was not available for analysis (requires Chrome Web Store sign-in, no direct download).

---

## 1. Manifest (Manifest V3)

| Field                       | Value                                                                    | Needed for Our Version?               |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `manifest_version`          | 3                                                                        | ✅ Yes — required                     |
| `name` / `short_name`       | "PostFlow"                                                               | ✅ Yes — branding                     |
| `version`                   | 1.0.0                                                                    | ✅ Yes                                |
| `description`               | Free, open-source...                                                     | ✅ Yes                                |
| `icons`                     | 16/32/48/128 PNG                                                         | ✅ Yes                                |
| `action.default_popup`      | `popup.html`                                                             | ✅ Yes — dashboard UI                 |
| `background.service_worker` | `background.js` (module)                                                 | ✅ Yes — scheduling, sharing, storage |
| `content_scripts`           | 3 entries (FB, WhatsApp, Messenger)                                      | ✅ Yes — FB only for MVP              |
| `options_page`              | `options.html`                                                           | ✅ Yes — group/template management    |
| `permissions`               | storage, scripting, activeTab, tabs, alarms, notifications, contextMenus | ✅ Mostly yes (contextMenus optional) |
| `host_permissions`          | `*://*.facebook.com/*`, `*://web.whatsapp.com/*`, `*://messenger.com/*`  | ✅ Facebook only for MVP              |
| `web_accessible_resources`  | icons for content script injection                                       | ✅ Yes                                |
| `content_security_policy`   | `'wasm-unsafe-eval'` for deps                                            | ✅ Yes if deps need it                |
| `minimum_chrome_version`    | 88                                                                       | ✅ Yes                                |
| `incognito`                 | "split"                                                                  | ✅ Yes                                |

**Least-privilege notes:**

- `contextMenus` — only if right-click features added; can drop for MVP
- WhatsApp/Messenger host_permissions — drop for Facebook-only MVP
- `tabs` — needed for `chrome.tabs.query` to find FB tab for sharing
- `activeTab` — alternative to host_permissions; current code uses host_permissions
- `alarms` — required for 1-min scheduler tick
- `notifications` — for desktop notifications on completion/failure

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHROME EXTENSION PROCESS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     runtime.sendMessage / onMessage     ┌────────┐ │
│  │  CONTENT SCRIPT  │ ◄──────────────────────────────────────► │        │ │
│  │  (ISOLATED world)│  Message types:                        │BACKGROUND│ │
│  │  • injects button│  - SCHEDULE_SHARE                       │ SERVICE  │ │
│  │  • extracts post │  - GET_GROUP_LISTS                      │ WORKER   │ │
│  │  • shows share   │  - GET_GROUPS_FOR_LIST                  │          │ │
│  │    sheet modal   │  - SYNC_GROUPS (extract groups)         │          │ │
│  │  • PERFORM_SHARE │  - GET_USER_SETTINGS                    │          │ │
│  │    (runs in page)│  - UPDATE_USER_SETTINGS                 │          │ │
│  └──────────────────┘  - SAVE/DELETE_GROUP_LIST               │          │ │
│         ▲              - SAVE/DELETE_TEMPLATE                 │          │ │
│         │              - SAVE/DELETE_IMAGE_SET                │          │ │
│         │              - EXPORT/IMPORT_DATA                   │          │ │
│         │              - CLEAR_ALL_DATA                       │          │ │
│         │              - SYNC_WHATSAPP/MESSENGER_GROUPS       │          │ │
│         │                                                     │          │ │
│  ┌──────┴──────┐                                             │          │ │
│  │  FACEBOOK   │                                             │          │ │
│  │    PAGE     │                                             │          │ │
│  └─────────────┘                                             │          │ │
│                                    chrome.storage.local ──────►│          │ │
│                                    (IndexedDB via idb)        │          │ │
│                                    chrome.alarms ────────────►│          │ │
│                                    (1-min periodic)           │          │ │
│                                    chrome.notifications       │          │ │
│                                    chrome.scripting.executeScript
│                                      (inject PERFORM_SHARE)   │          │ │
│                                                             │          │ │
│  ┌──────────────────┐     runtime.sendMessage               │          │ │
│  │    POPUP UI      │ ◄─────────────────────────────────────►│          │ │
│  │  (React + Vite)  │  Message types:                       └────────┘ │
│  │  • Dashboard     │  - GET_GROUP_LISTS
│  │  • Lists         │  - GET_ALL_SCHEDULED
│  │  • Scheduled     │  - GET_SHARE_HISTORY
│  │  • History       │  - GET_USER_SETTINGS
│  │  • Settings      │  - GET_DAILY_POSTS
│  └──────────────────┘  - EXPORT/IMPORT_DATA
│                        - CLEAR_ALL_DATA
│                        - SYNC_WHATSAPP/MESSENGER_GROUPS
│                                                                         │
│  ┌──────────────────┐     runtime.sendMessage               (separate) │
│  │   OPTIONS PAGE   │ ◄─────────────────────────────────────────────────┤
│  │  (React + Vite)  │  Message types:                                 │
│  │  • Groups tab    │  - GET_USER_SETTINGS                            │
│  │  • Templates     │  - SYNC_GROUPS                                  │
│  │  • Images        │  - GET_GROUP_LISTS                              │
│  └──────────────────┘  - SAVE/DELETE_GROUP_LIST                       │
│                        - SAVE/DELETE_TEMPLATE                         │
│                        - SAVE/DELETE_IMAGE_SET                        │
│                        - EXPORT/IMPORT_DATA                           │
│                        - CLEAR_ALL_DATA                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Message Types & Payloads

### Content Script → Background

| Type                  | Payload                                                        | Response                                                     |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `SCHEDULE_SHARE`      | `{ postUrl, postPreview, groupListId, settings, scheduledAt }` | `{ success, shareId?, error? }`                              |
| `GET_GROUP_LISTS`     | —                                                              | `GroupList[]`                                                |
| `GET_GROUPS_FOR_LIST` | `{ listId }`                                                   | `{ id, name }[]`                                             |
| `SYNC_GROUPS`         | —                                                              | `{ success, groups?: {id,name,url,memberCount?}[], error? }` |
| `GET_USER_SETTINGS`   | —                                                              | `UserSettings`                                               |
| `PERFORM_SHARE`       | `{ postUrl, groupId, settings, preview }`                      | `{ success, error? }`                                        |

### Popup/Options → Background

| Type                    | Payload                 | Response                       |
| ----------------------- | ----------------------- | ------------------------------ |
| `GET_GROUP_LISTS`       | —                       | `GroupList[]`                  |
| `GET_ALL_SCHEDULED`     | —                       | `ScheduledShare[]`             |
| `GET_SHARE_HISTORY`     | —                       | `ShareResult[]`                |
| `GET_USER_SETTINGS`     | —                       | `UserSettings`                 |
| `UPDATE_USER_SETTINGS`  | `Partial<UserSettings>` | `{ success }`                  |
| `SAVE_GROUP_LIST`       | `GroupList`             | `{ success }`                  |
| `DELETE_GROUP_LIST`     | `{ id }`                | `{ success }`                  |
| `SAVE_TEMPLATE`         | `Template`              | `{ success }`                  |
| `DELETE_TEMPLATE`       | `{ id }`                | `{ success }`                  |
| `SAVE_IMAGE_SET`        | `ImageSet`              | `{ success }`                  |
| `DELETE_IMAGE_SET`      | `{ id }`                | `{ success }`                  |
| `EXPORT_DATA`           | —                       | JSON string                    |
| `IMPORT_DATA`           | `{ data: string }`      | `{ success, error? }`          |
| `CLEAR_ALL_DATA`        | —                       | `{ success }`                  |
| `GET_DAILY_POSTS`       | —                       | `number`                       |
| `SYNC_WHATSAPP_GROUPS`  | —                       | `{ success, groups?, error? }` |
| `SYNC_MESSENGER_GROUPS` | —                       | `{ success, groups?, error? }` |

### Background → Content (broadcast)

| Type             | Payload                                |
| ---------------- | -------------------------------------- |
| `SHARE_PROGRESS` | `{ shareId, progress: ShareProgress }` |
| `PLAY_SOUND`     | `{ sound: 'completed' \| 'failed' }`   |

---

## 4. Storage Schema (IndexedDB via `idb`)

Keys prefixed: `fgp/<namespace>/<id>` or `fgp/<namespace>`

| Namespace         | Type                                      | Key                        |
| ----------------- | ----------------------------------------- | -------------------------- |
| `groups`          | `Record<string, Group>`                   | `fgp/groups/<id>`          |
| `groupLists`      | `Record<string, GroupList>`               | `fgp/groupLists/<id>`      |
| `scheduledShares` | `Record<string, ScheduledShare>`          | `fgp/scheduledShares/<id>` |
| `shareHistory`    | `Record<string, ShareResult>`             | `fgp/shareHistory/<id>`    |
| `imageSets`       | `Record<string, ImageSet>`                | `fgp/imageSets/<id>`       |
| `templates`       | `Record<string, Template>`                | `fgp/templates/<id>`       |
| `userSettings`    | `UserSettings`                            | `fgp/userSettings`         |
| `dailyPosts`      | `number`                                  | `fgp/dailyPosts`           |
| `dailyPostsDate`  | `string` (YYYY-MM-DD)                     | `fgp/dailyPostsDate`       |
| `freeSharesUsed`  | `number`                                  | `fgp/freeSharesUsed`       |
| `fbSession`       | `{ userId, name, profilePic, expiresAt }` | `fgp/fbSession`            |

---

## 5. Content Script — Button Injection & Post Extraction

### Button Injection

- **Trigger:** `MutationObserver` on `document.body` (childList, subtree) + `DOMContentLoaded`
- **Target:** Facebook's native share button: `[data-testid="share-button"]`
- **Position:** Configurable via settings — `after_share` (default), `before_share`, or `floating`
- **Guard:** Checks `userSettings.showShareButton` and avoids duplicate injection (`.fgp-share-to-groups-btn` class)

### Post Preview Extraction (`extractPostPreview`)

| Field              | Selectors (fallback chain)                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `authorName`       | `a[href*="/user/"]`, `a[href*="/profile/"]`, `[role="heading"] strong`, `strong.x1lliihq`                   |
| `authorProfileUrl` | Same link's `href`                                                                                          |
| `text`             | `[data-testid="post_message"]`, `[data-ad-comet-preview="message"]`, `.x1iorvi4`, long auto-generated class |
| `images`           | `img[src*="scontent"]`, `img[src*="fbcdn"]` — filters out profile/emoji/small                               |
| `videoUrl`         | `video` element `src`                                                                                       |
| `isReel`           | Presence of `a[href*="/reel/"]`                                                                             |
| `isVideo`          | `video` element exists                                                                                      |
| `url`              | `a[href*="/posts/"]`, `a[href*="/videos/"]`, `a[href*="/reel/"]` or `window.location.href`                  |
| `postedAt`         | `Date.now()` (no reliable timestamp in DOM)                                                                 |

### Share Sheet Modal

- Injected into `document.body` as fixed overlay (z-index 2147483647)
- **Not Shadow DOM** — vulnerable to FB CSS leakage (intentionally uses high-specificity inline styles)
- Tabs: Share mode (original vs repost), Caption (spintax), First comment, Group selector (lists → groups), Advanced settings (safety, overnight, daily limit)
- Buttons: Cancel, Schedule, Share Now

---

## 6. Background — Share Automation (`performShare` in background)

**Runs in page context via `chrome.scripting.executeScript` on a Facebook tab**

### Sequence

1. **Find share button** → `[data-testid="share-button"]` → click
2. **Wait 1s** → find share dialog → `[role="dialog"]` containing "Share"
3. **Find group input** → `input[placeholder*="group" i]`, `input[aria-label*="group" i]` → set value to group ID → dispatch `input` event → wait 300ms
4. **Optional caption** → `textarea[placeholder*="say" i]`, `[contenteditable="true"]` → set textContent → dispatch `input` → wait 300ms
5. **Find Post button** → `[role="button"]` with text "Post" or "Share" → click → wait 1s
6. **Return** `{ success: true }` or `{ success: false, error }`

### Failure Detection

- Share button not found → `"Share button not found"`
- Share dialog didn't open → `"Share dialog not opened"`
- Group input not found → silently continues (no group targeting)
- Post button not found → silently continues
- Any exception → caught, returns error message

**No detection for:** CAPTCHA, checkpoint, "temporarily blocked", rate-limit warnings, admin approval pending, sharing disabled for group.

---

## 7. Group Management

### Data Model

```typescript
Group {
  id: string           // extracted from URL: groups/(\d+) or groups/([^/?]+)
  name: string         // from heading/strong/[dir="auto"]
  url: string          // group link href
  platform: 'facebook' | 'whatsapp' | 'messenger'
  memberCount?: number // from text matching "N members/people"
  isAdmin?: boolean
  category?: string
  addedAt: number
  lastPostedAt?: number
}

GroupList {
  id: string
  name: string
  groupIds: string[]
  color: string        // UI chip color
  platform: Platform
  createdAt: number
  updatedAt: number
}
```

### Sync (Facebook)

- User must be on `facebook.com/groups/feed/` (Groups feed)
- `extractGroupsFromPage()` tries multiple selector strategies:
  - Item selectors: `[role="listitem"]`, `[data-testid="group-card"]`, `[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]`, `.x1yztbdb`, `.x1n2onr6`, `.x78zum5`, `.x1q0g3np`, `.x1iyjqo2`, `div[role="article"]`
  - Name selectors: `[role="heading"]`, `strong`, `.x1lliihq`, `[dir="auto"]`, `[data-testid="group-name"]`, `h3`, `h4`
  - Link selectors: `a[href*="/groups/"]`, `a[href*="facebook.com/groups/"]`
- Stops at first selector yielding results
- Deduplicates by extracted ID

### Sync (WhatsApp/Messenger)

- Similar multi-selector approach with auto-generated class fallbacks
- IDs synthesized: `wa_<name>`, `ms_<name>`

---

## 8. Pacing & Scheduling

### Delay Calculation (`calculateDelay`)

```typescript
baseDelay = settings.delayBetweenGroups || 30000  // 30s default
jitter = random(SAFETY_LEVEL_DELAYS[safetyLevel].min, .max)
total = baseDelay + jitter
```

| Safety Level | Min Jitter | Max Jitter | Effective Range (with 30s base) |
| ------------ | ---------- | ---------- | ------------------------------- |
| `fast`       | 10s        | 20s        | 40–50s                          |
| `balanced`   | 30s        | 60s        | 60–90s                          |
| `safe`       | 90s        | 180s       | 120–210s                        |

### Overnight Pause

- Parses `overnightStart`/`overnightEnd` (HH:MM)
- Handles overnight span (e.g., 22:00–07:00)
- `waitForOvernightPauseEnd` sleeps until end time (next day if needed)

### Scheduler

- **Alarm:** `fgp-scheduler` every 1 minute
- **On tick:** `processScheduledShares()` finds `pending` shares with `scheduledAt <= now`
- **Execution:** `executeShare(shareId)` — runs sequentially through groups with delays
- **Daily reset:** Checks `dailyPostsDate` vs today, resets counter
- **Daily cap:** `maxPostsPerDay` (default 200) — stops share job if exceeded

### Recovery After Restart

- Service worker restarts → `onStartup` → `setupAlarms()` + `processScheduledShares()`
- Pending shares with past `scheduledAt` execute immediately
- In-progress shares (`status: 'running'`) — **not resumed**; stay as `running` until next tick (no checkpointing)

---

## 9. Caption Features

### Spintax

- **Detection:** `caption.includes('{') && caption.includes('|')` → `useSpintax: true`
- **Parsing:** Not implemented in current code (stub only)
- **Variations:** `spintaxVariations?: string[]` in type but unused

### First Comment

- Separate textarea in share sheet
- Sent as `firstComment` in `ShareSettings`
- Not implemented in `performShare` (stub only)

---

## 10. Network Requests

| Purpose            | Destination                     | Current Code                                       |
| ------------------ | ------------------------------- | -------------------------------------------------- |
| License/analytics  | None                            | ✅ No external requests                            |
| Config/updates     | None                            | ✅ No remote code                                  |
| Facebook Graph API | `*.facebook.com`, `*.fbcdn.net` | Only via user's browser session (share automation) |
| WhatsApp Web       | `web.whatsapp.com`              | Only for group sync (content script)               |
| Messenger          | `messenger.com`                 | Only for group sync (content script)               |

**CSP allows:** `https://*.facebook.com`, `https://*.fbcdn.net`, `https://web.whatsapp.com`, `https://www.messenger.com`

---

## 11. Fragile Points (Likely to Break on FB Changes)

| Area                                | Selectors / Logic                                               | Risk                                          |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| **Native share button**             | `[data-testid="share-button"]`                                  | High — testid may change                      |
| **Share dialog**                    | `[role="dialog"]` + text "Share"                                | High — role/text may change                   |
| **Group input in dialog**           | `input[placeholder*="group" i]`, `input[aria-label*="group" i]` | High — placeholder/aria-label vary by locale  |
| **Post button in dialog**           | `[role="button"]` with text "Post"/"Share"                      | High — text varies by locale, role may change |
| **Post text extraction**            | 4+ fallback selectors including 80-char auto-generated class    | Very High — comet classes change monthly      |
| **Author name/link**                | `a[href*="/user/"]`, `[role="heading"] strong`                  | Medium                                        |
| **Image extraction**                | `img[src*="scontent"]`, `img[src*="fbcdn"]`                     | Medium — CDN domains stable                   |
| **Group feed sync**                 | 9 item selectors, 7 name selectors, 2 link selectors            | Very High — feed layout changes frequently    |
| **Group ID from URL**               | Regex `groups\/(\d+)` or `groups\/([^\/?]+)`                    | Low — URL structure stable                    |
| **Service worker 5-min timeout**    | Alarms handle scheduling                                        | Medium — non-alarm tasks may delay            |
| **No CAPTCHA/checkpoint detection** | None implemented                                                | Critical — account risk                       |

---

## 12. Current Gaps vs. Requirements

| Requirement                  | Current Status                                            |
| ---------------------------- | --------------------------------------------------------- |
| Shadow DOM for share sheet   | ❌ Regular DOM (CSS leakage risk)                         |
| Spintax parsing              | ❌ Detection only, no expansion                           |
| First comment posting        | ❌ UI only, not implemented in automation                 |
| CAPTCHA/checkpoint detection | ❌ None                                                   |
| Job resume after SW restart  | ❌ Running jobs stuck as `running`                        |
| "Repost as me" mode          | ❌ UI only, `performShare` always uses share flow         |
| Video/reel share mode        | ⚠️ Detected but uses same share flow                      |
| E2E tests                    | ❌ Playwright config exists, `e2e/` empty                 |
| Unit tests                   | ✅ `security.test.ts`, `storage.test.ts`                  |
| TypeScript strictness        | ⚠️ 25 pre-existing `any` warnings in sanitization/storage |
| Multi-platform (WA/MS)       | ✅ Implemented but selectors very brittle                 |

---

## 13. Files Reference

```
src/
├── background/index.ts      # Service worker (34 KB) — scheduling, sharing, messages
├── content/index.ts         # FB content script (800+ lines) — injection, extraction, share sheet
├── content/whatsapp.ts      # WhatsApp group sync
├── content/messenger.ts     # Messenger group sync
├── popup/index.tsx          # React popup (650+ lines) — dashboard, lists, scheduled, history, settings
├── options/index.tsx        # React options (minimal — groups/templates/images tabs)
├── options/styles.css       # Shared design system (20 KB)
├── shared/
│   ├── types.ts             # All interfaces, defaults, constants
│   ├── storage.ts           # IndexedDB wrapper (idb) + namespacing
│   ├── security.ts          # Sanitization (HTML, URL, caption, settings, IDs)
│   ├── logger.ts            # Structured logging
│   ├── storage.test.ts      # Unit tests
│   └── security.test.ts     # Unit tests
├── test/setup.ts            # Vitest setup
public/
├── manifest.json            # MV3 manifest
├── icons/                   # 16/32/48/128 PNG
vite.config.ts               # Multi-entry build (popup, options, content, background)
tsconfig.json                # Strict TS config
package.json                 # Dependencies & scripts
```
