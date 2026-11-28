# DESIGN.md — Phase 2: Modular Architecture & fb-adapter

> **Status:** Awaiting approval before Phase 3 implementation

---

## 1. Design Goals

| Goal                    | Strategy                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Selector resilience** | All FB DOM logic in `fb-adapter/` with multiple fallback strategies (aria-label, role, structural, multi-language text match)        |
| **Testability**         | Pure functions, dependency injection, Playwright fixtures for adapter tests                                                          |
| **Maintainability**     | Single-file fixes for FB changes; no scattered selectors                                                                             |
| **State clarity**       | Typed state machine for share jobs: `queued → opening → selecting-group → captioning → posting → verifying → done \| failed(reason)` |
| **CSS isolation**       | Share sheet in Shadow DOM (or CSS Modules + high-specificity)                                                                        |
| **Recovery**            | Checkpoint progress after each group; resume or mark interrupted on SW restart                                                       |
| **Safety defaults**     | Conservative: 60-180s jitter, daily cap 20, quiet hours, immediate stop on any anomaly                                               |

---

## 2. Proposed Folder Structure

```
src/
├── background/
│   ├── index.ts                 # Service worker entry — registers listeners, alarms
│   ├── scheduler.ts             # Alarm tick → process queue
│   ├── job-runner.ts            # Executes a single share job (state machine)
│   ├── job-queue.ts             # Persistent queue with checkpointing
│   ├── storage.ts               # Background-specific storage helpers
│   ├── messages.ts              # Message handlers (typed)
│   └── notifications.ts         # Desktop notifications + sounds
│
├── content/
│   ├── index.ts                 # Content script entry — injection, messaging
│   ├── button-injector.ts       # Finds native share button, injects ours
│   ├── post-extractor.ts        # Extracts PostPreview from post container
│   ├── share-sheet-host.ts      # Mounts Shadow DOM share sheet
│   └── fb-adapter/              # ← ALL FACEBOOK-SPECIFIC CODE HERE
│       ├── index.ts             # Public API: extractGroups, extractPost, performShare
│       ├── selectors.ts         # Selector strategies (configurable, versioned)
│       ├── strategies/
│       │   ├── aria-label.ts    # Strategy: aria-label / role / testid
│       │   ├── structural.ts    # Strategy: DOM structure / relative position
│       │   ├── text-match.ts    # Strategy: multi-language text content match
│       │   └── shadow-dom.ts    # Strategy: pierce Shadow DOM if FB uses it
│       ├── extract-groups.ts    # Group feed extraction (multi-strategy)
│       ├── extract-post.ts      # Post preview extraction (multi-strategy)
│       ├── perform-share.ts     # Share automation sequence (multi-strategy)
│       ├── detect-anomaly.ts    # CAPTCHA, checkpoint, rate-limit, blocked detection
│       └── types.ts             # Adapter-specific types (SelectorStrategy, ExtractionResult)
│
├── popup/
│   ├── index.tsx                # React entry
│   ├── App.tsx                  # Tab layout + state
│   ├── tabs/
│   │   ├── Dashboard.tsx
│   │   ├── Lists.tsx
│   │   ├── Scheduled.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── components/              # Shared UI components
│   └── hooks/                   # Popup-specific hooks
│
├── options/
│   ├── index.tsx                # React entry
│   ├── App.tsx                  # Tab layout
│   ├── tabs/
│   │   ├── Groups.tsx           # Sync, create/edit lists
│   │   ├── Templates.tsx        # CRUD templates
│   │   └── Images.tsx           # CRUD image sets
│   └── components/
│
├── shared/
│   ├── types.ts                 # All domain types (Source of Truth)
│   ├── storage.ts               # IndexedDB wrapper (idb) — single instance
│   ├── security.ts              # Sanitization & validation (Zod schemas)
│   ├── logger.ts                # Structured logging
│   ├── state-machine.ts         # ShareJobStateMachine (typed transitions)
│   ├── spintax.ts               # Spintax parser & expander
│   ├── id.ts                    # Secure ID generation
│   └── constants.ts             # Safety levels, delays, limits
│
├── fb-adapter/                  # Also exported for testing
│   └── (mirror of content/fb-adapter for Node/Playwright tests)
│
└── test/
    ├── setup.ts
    ├── fb-adapter/
    │   ├── fixtures/            # Saved HTML snapshots (FB post, group feed, share dialog)
    │   ├── extract-groups.test.ts
    │   ├── extract-post.test.ts
    │   ├── perform-share.test.ts
    │   └── detect-anomaly.test.ts
    ├── shared/
    │   ├── spintax.test.ts
    │   ├── state-machine.test.ts
    │   ├── security.test.ts
    │   └── storage.test.ts
    └── e2e/                     # Playwright E2E (future)
```

---

## 3. fb-adapter Module Design

### 3.1 Public API (`fb-adapter/index.ts`)

```typescript
// Group extraction
export async function extractGroupsFromFeed(): Promise<ExtractionResult<RawGroup[]>>;

// Post preview extraction
export async function extractPostPreview(
  container: Element
): Promise<ExtractionResult<PostPreview>>;

// Share automation (runs in page context via executeScript)
export async function performShare(
  postUrl: string,
  groupId: string,
  settings: ShareSettings,
  preview: PostPreview
): Promise<ShareResult>;

// Anomaly detection (called after each step)
export function detectAnomaly(doc: Document): Anomaly | null;

// Selector versioning (for gradual rollout / A/B)
export const SELECTOR_VERSION = '2025-01-15';
```

### 3.2 Selector Strategies (Priority Order)

Each target element (share button, group input, post button, etc.) gets tried in order:

| Priority | Strategy                       | Example                                                                        |
| -------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 1        | **aria-label / role / testid** | `[role="button"][aria-label*="Share" i]`, `[data-testid="share-button"]`       |
| 2        | **Structural**                 | `div[role="article"] >> button:has-text("Share")` (relative to post container) |
| 3        | **Multi-language text match**  | Button with text matching `/share                                              | compartir | partager | teilen | 分享/i` |
| 4        | **Shadow DOM pierce**          | If FB moves to Shadow DOM, use `element.shadowRoot?.querySelector(...)`        |

### 3.3 Strategy Interface

```typescript
interface SelectorStrategy<T> {
  name: string;
  select(root: Document | Element): T | null;
  validate(result: T): boolean; // e.g., button is visible, enabled
}

function tryStrategies<T>(strategies: SelectorStrategy<T>[], root: Document | Element): T | null {
  for (const s of strategies) {
    const result = s.select(root);
    if (result && s.validate(result)) return result;
  }
  return null;
}
```

### 3.4 Versioned Selector Registry

```typescript
// selectors.ts
export const SELECTORS = {
  v1: { ... },  // Current
  v2: { ... },  // Next FB redesign
} as const;

export type SelectorVersion = keyof typeof SELECTORS;
export const CURRENT_VERSION: SelectorVersion = 'v1';
```

**Updating selectors = one file change** (`selectors.ts` + add version). Old versions preserved for rollback.

---

## 4. Share Job State Machine

### 4.1 States

```typescript
type ShareJobState =
  | { status: 'queued'; scheduledAt: number }
  | { status: 'opening'; startedAt: number }
  | { status: 'selecting-group'; groupId: string; attempt: number }
  | { status: 'captioning'; groupId: string }
  | { status: 'posting'; groupId: string }
  | { status: 'verifying'; groupId: string }
  | { status: 'done'; completedAt: number; results: GroupResult[] }
  | { status: 'failed'; reason: FailureReason; failedAt: number; partialResults: GroupResult[] }
  | { status: 'interrupted'; reason: 'sw-restart' | 'browser-close'; checkpoint: Checkpoint };
```

### 4.2 Transitions (Typed, Exhaustive)

```typescript
// shared/state-machine.ts
type Transition =
  | { from: 'queued'; to: 'opening'; trigger: 'alarm-tick' }
  | { from: 'opening'; to: 'selecting-group'; trigger: 'share-dialog-opened' }
  | { from: 'opening'; to: 'failed'; trigger: 'anomaly-detected'; reason: FailureReason }
  | { from: 'selecting-group'; to: 'captioning'; trigger: 'group-selected' }
  | { from: 'selecting-group'; to: 'failed'; trigger: 'group-not-found' }
  | { from: 'captioning'; to: 'posting'; trigger: 'caption-set' }
  | { from: 'posting'; to: 'verifying'; trigger: 'post-clicked' }
  | { from: 'verifying'; to: 'selecting-group'; trigger: 'success'; nextGroup: string }
  | { from: 'verifying'; to: 'done'; trigger: 'all-groups-done' }
  | { from: 'verifying'; to: 'failed'; trigger: 'anomaly-detected'; reason: FailureReason }
  | { from: '*'; to: 'interrupted'; trigger: 'sw-restart' };

// Runtime enforcement
function transition(state: ShareJobState, event: StateEvent): ShareJobState {
  const valid = TRANSITIONS.find(t => t.from === state.status || t.from === '*');
  if (!valid || valid.trigger !== event.type) {
    throw new Error(`Invalid transition: ${state.status} → ${event.type}`);
  }
  return applyTransition(state, event);
}
```

### 4.3 Checkpointing (Persistence)

After **each group completes** (success or failure):

```typescript
interface Checkpoint {
  shareId: string;
  jobState: ShareJobState;
  completedGroups: GroupResult[];
  currentGroupIndex: number;
  updatedAt: number;
}

// In job-runner.ts
async function checkpoint(job: ShareJob, state: ShareJobState): Promise<void> {
  await storage.set(
    'jobCheckpoints',
    { ...job.checkpoint, ...state, updatedAt: Date.now() },
    job.id
  );
}

// On SW startup (background/index.ts)
async function recoverJobs(): Promise<void> {
  const checkpoints = await storage.getAll<Checkpoint>('jobCheckpoints');
  for (const cp of checkpoints) {
    if (cp.jobState.status === 'running' || cp.jobState.status === 'selecting-group') {
      // Resume from next group
      await jobQueue.enqueue(resumeFromCheckpoint(cp));
    } else if (cp.jobState.status === 'opening' || cp.jobState.status === 'captioning') {
      // Mark interrupted — user must retry
      await storage.set(
        'scheduledShares',
        { ...job, status: 'interrupted', checkpoint: cp },
        job.id
      );
    }
  }
}
```

---

## 5. Share Sheet — Shadow DOM Architecture

### 5.1 Mounting (content/share-sheet-host.ts)

```typescript
function mountShareSheet(preview: PostPreview): ShadowRoot {
  const host = document.createElement('fgp-share-sheet');
  host.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject styles (CSS custom properties + component styles)
  const style = document.createElement('style');
  style.textContent = SHARE_SHEET_CSS; // bundled at build time
  shadow.appendChild(style);

  // Mount React app into shadow root
  const root = createRoot(shadow);
  root.render(<ShareSheet preview={preview} onClose={unmount} onSubmit={handleSubmit} />);

  return shadow;
}
```

### 5.2 CSS Strategy

| Approach                           | Pros                                              | Cons                                           |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **Shadow DOM (closed)**            | Complete isolation, no FB CSS leakage             | Can't use global CSS variables; styles bundled |
| **CSS Modules + high specificity** | Can use design tokens, easier debugging           | FB `!important` could still win                |
| **Hybrid**                         | Shadow DOM for wrapper, CSS Modules for internals | Complexity                                     |

**Recommendation:** Shadow DOM (closed) with all styles inlined. Use `constructStylesheet()` for performance.

### 5.3 Communication

- Content script ↔ Shadow sheet: CustomEvent / `postMessage` (since closed shadow)
- Sheet → Background: `chrome.runtime.sendMessage` (works from shadow)

---

## 6. Spintax Parser (`shared/spintax.ts`)

```typescript
// {opt1|opt2|opt3} → random choice
// Nested: {Hello|Hi} {world|everyone} → 4 combinations
// Weighted: {opt1:50|opt2:30|opt3:20} (optional extension)

export function parseSpintax(text: string): SpintaxNode;
export function expandSpintax(ast: SpintaxNode, rng?: () => number): string;
export function hasSpintax(text: boolean): boolean;

// Example:
expandSpintax(parseSpintax('{Hello|Hi} {world|everyone}!'));
// → "Hi everyone!" (random)
```

---

## 7. Anomaly Detection (`fb-adapter/detect-anomaly.ts`)

```typescript
type AnomalyType =
  | 'captcha'
  | 'checkpoint'
  | 'rate-limit'
  | 'temporarily-blocked'
  | 'sharing-disabled'
  | 'admin-approval-required'
  | 'unexpected-dialog'
  | 'network-error';

interface Anomaly {
  type: AnomalyType;
  message: string;
  recoverable: boolean; // false = stop job immediately
  selector?: string; // What we were looking for when detected
}

export function detectAnomaly(doc: Document): Anomaly | null {
  // 1. CAPTCHA: iframe[src*="captcha"], div[id*="captcha"], text "Enter the code"
  // 2. Checkpoint: text "Checkpoint", "Verify your identity", "Security check"
  // 3. Rate limit: text "temporarily blocked", "too many", "rate limit", "slow down"
  // 4. Sharing disabled: "sharing not allowed", "can't share", "disabled for this group"
  // 5. Admin approval: "pending admin approval", "awaiting review"
  // 6. Unexpected dialog: [role="dialog"] not matching share dialog selectors
  // 7. Network error: failed requests in performance observer
}
```

**On any anomaly with `recoverable: false`:**

1. Stop job immediately
2. Mark job `failed` with reason
3. Show toast: "Stopped: [reason]. Your account may be at risk."
4. Do NOT retry, do NOT continue to next group

---

## 8. Safety Defaults (Conservative)

| Setting              | Default                   | Rationale                     |
| -------------------- | ------------------------- | ----------------------------- |
| `delayBetweenGroups` | 60,000ms (1 min) base     | FB watches for rapid actions  |
| `safetyLevel`        | `'safe'` (90-180s jitter) | Total 150-240s between groups |
| `overnightPause`     | `true` (22:00-07:00)      | Human-like pattern            |
| `maxPostsPerDay`     | 20                        | Well below typical limits     |
| `confirmBeforeShare` | `true`                    | User intent verification      |
| Anomaly response     | Immediate stop            | Never evade detection         |

---

## 9. Build & Test Stack

| Layer         | Tool                                  | Config                            |
| ------------- | ------------------------------------- | --------------------------------- |
| Build         | Vite + `@crxjs/vite-plugin`           | Multi-entry, manifest from source |
| Framework     | React 18 + TypeScript                 | Strict mode, no `any`             |
| State         | Zustand (global) + useState (local)   | Persist queue in IndexedDB        |
| Storage       | `idb` wrapper + Zod validation        | Schema-validated reads/writes     |
| Unit tests    | Vitest                                | `shared/`, `fb-adapter/`          |
| Adapter tests | Vitest + JSDOM + saved HTML fixtures  | `test/fb-adapter/fixtures/`       |
| E2E tests     | Playwright + Chrome extension loading | `test/e2e/` (future)              |
| Lint          | ESLint flat + TypeScript ESLint       | Strict, no unused                 |
| Format        | Prettier                              | Single quote, trailing comma      |

---

## 10. Repository Hygiene (Required Files)

| File                       | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `README.md`                | Install from source, disclaimer (FB terms, account risk)                 |
| `PRIVACY.md`               | Local-only, no telemetry, no remote code, no cookies                     |
| `CONTRIBUTING.md`          | How to update selectors when FB changes (edit `fb-adapter/selectors.ts`) |
| `LICENSE`                  | MIT                                                                      |
| `.github/workflows/ci.yml` | Lint, typecheck, unit tests on PR/push                                   |
| `.gitignore`               | `dist/`, `node_modules/`, `.env`, `*.log`                                |

---

## 11. Migration Path from Current Code

| Current                   | New Location                   | Notes                                   |
| ------------------------- | ------------------------------ | --------------------------------------- |
| `src/background/index.ts` | `src/background/` (split)      | Extract scheduler, job-runner, queue    |
| `src/content/index.ts`    | `src/content/` + `fb-adapter/` | Split injection, extraction, automation |
| `src/shared/types.ts`     | `src/shared/types.ts`          | Keep as Source of Truth                 |
| `src/shared/storage.ts`   | `src/shared/storage.ts`        | Keep, add Zod validation                |
| `src/shared/security.ts`  | `src/shared/security.ts`       | Migrate to Zod schemas                  |
| `src/popup/index.tsx`     | `src/popup/` (componentized)   | Split tabs into components              |
| `src/options/index.tsx`   | `src/options/` (componentized) | Split tabs                              |
| `src/options/styles.css`  | `src/shared/design-tokens.css` | CSS custom properties only              |

---

## 12. Acceptance Criteria for Phase 2

- [ ] Modular folder structure defined and approved
- [ ] `fb-adapter` module design with multi-strategy selectors approved
- [ ] Typed state machine for share jobs approved
- [ ] Shadow DOM share sheet architecture approved
- [ ] Spintax parser spec approved
- [ ] Anomaly detection spec approved
- [ ] Safety defaults approved
- [ ] Build/test stack confirmed
- [ ] Repo hygiene files listed

---

**Ready for your approval.** Once approved, Phase 3 will begin implementation with the new architecture.
