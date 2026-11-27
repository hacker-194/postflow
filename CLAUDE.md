# Free Group Poster — Project Instructions

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.6+ |
| Framework | React | 18.3 |
| Build | Vite | 5.4 |
| Extension | Manifest V3 | Chrome 88+ |
| Storage | IndexedDB (idb) | 8.0 |
| State | Zustand | 4.5 |
| Icons | Lucide React | 0.46 |
| Dates | date-fns | 3.6 |
| Testing | Vitest + Playwright | 2.1 / 1.46 |
| Linting | ESLint (flat) + Prettier | 9.13 / 3.3 |

## Project Structure

```
src/
├── background/     # Service worker (MV3) - scheduling, sharing, storage
├── content/        # Content script - Facebook DOM injection, share sheet
├── popup/          # React popup UI - dashboard, lists, history, settings
├── options/        # React options page - lists, templates, images, settings
├── shared/         # Shared types, storage, security, logger
│   ├── types.ts       # Core interfaces (Group, Template, Settings, etc.)
│   ├── storage.ts     # IndexedDB wrapper with namespacing
│   ├── security.ts    # Sanitization, validation, message handling
│   └── logger.ts      # Structured logging
└── test/           # Test setup
e2e/                # Playwright E2E tests
dist/               # Production build output
```

## Commands

```bash
npm run dev           # Development build with file watching
npm run build         # Production build to dist/
npm run preview       # Preview production build
npm run lint          # ESLint (strict)
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Prettier format
npm run format:check  # Check formatting
npm run test          # Unit tests (Vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:e2e      # E2E tests (Playwright)
npm run test:e2e:ui   # Playwright UI
npm run prepare       # Husky setup (git hooks)
```

## Code Conventions

- **File naming**: kebab-case for files, PascalCase for React components
- **Types**: Strict TypeScript, no `any` without justification (25 pre-existing warnings in sanitization/storage)
- **Imports**: Grouped: external → internal → relative; `type` imports for types
- **Components**: Function components with explicit props interfaces
- **State**: Zustand for global, useState for local
- **Async**: async/await throughout; no bare promises
- **Error handling**: Try/catch with user-facing messages; log errors server-side
- **Security**: All user input sanitized via `security.ts` exports
- **Messages**: Allowlist validation in background (`VALID_MESSAGE_TYPES`)

## Architecture Patterns

### Message Passing (Background ↔ Content/Popup/Options)

```typescript
// Background: chrome.runtime.onMessage.addListener
// Types validated via VALID_MESSAGE_TYPES allowlist
// Sender ID verified: sender.id === chrome.runtime.id
// All payloads sanitized before storage
```

### Storage (IndexedDB via idb)

```typescript
// Namespaced keys: fgp/<namespace>/<id>
// Single object store, key-based access
// get/set/getAll/del/clearNamespace helpers
// Export/import full JSON backup
```

### Content Script Injection

```typescript
// ISOLATED world, runs at document_idle
// MutationObserver watches for FB share buttons
// Injects "Share to Groups" button next to FB's share button
// Opens share sheet modal on click
```

### Scheduling (Background Alarms)

```typescript
// 1-minute alarm processes pending shares
// Respects: safety level delays, overnight pause, daily limit
// Progress broadcast via runtime.sendMessage
```

## Security Rules

- **No external requests** except Facebook domains (enforced by CSP + host_permissions)
- **All input sanitized**: `sanitizeHtml`, `sanitizeUrl`, `sanitizeCaption`, etc.
- **Message validation**: Allowlist + sender ID + payload sanitization
- **No secrets in code**: Config via user settings only
- **Local-only data**: IndexedDB, no sync, no analytics (opt-in only)

## Testing Patterns

- **Unit**: `src/shared/*.test.ts` — pure functions (security, storage)
- **E2E**: Playwright with built extension — not yet implemented
- **Coverage**: `npm run test:coverage` (V8 provider)

## Git Conventions

- **Commits**: Conventional Commits (feat:, fix:, chore:, etc.)
- **Branches**: feature/, fix/, chore/
- **Pre-commit**: Husky runs lint-staged on changed files
- **Release**: `npm version patch|minor|major` → GitHub Actions builds zip

## Extension-Specific Notes

### Manifest V3 Constraints

- Service worker has 5-min idle timeout; alarms handle scheduling
- `chrome.scripting.executeScript` for content script communication
- CSP: `'wasm-unsafe-eval'` required by some dependencies
- Host permissions limited to Facebook domains

### Facebook DOM Fragility

- Selectors in `content/index.ts` use FB's auto-generated class names
- These change frequently; expect breakage
- No automated resilience; manual updates required

### Chrome Web Store

- Manifest V3, no remote code, minimal permissions → likely pass technical review
- Policy risk: "automation" category may trigger extra scrutiny
- Prepare: clear description, safety features, user-initiated actions

## Where to Look

| I want to... | Look at... |
|--------------|------------|
| Add a new data type | `src/shared/types.ts` + `storage.ts` namespaces |
| Add a settings option | `src/shared/types.ts` (UserSettings) + `options/index.tsx` |
| Change sharing logic | `src/background/index.ts` (performShare, executeShare) |
| Modify share sheet UI | `src/content/index.ts` (createShareSheet) |
| Add popup feature | `src/popup/index.tsx` (tabs + components) |
| Fix selector breakage | `src/content/index.ts` (extractPostPreview, injectShareButton) |
| Add validation | `src/shared/security.ts` |
| Run tests | `npm run test` (unit) / `npm run test:e2e` (E2E) |

## Known Limitations

1. **No E2E tests** — Playwright config exists but `e2e/` is empty
2. **FB selectors brittle** — Auto-generated classes change monthly
3. **No cross-browser** — Chrome-only (MV3, no Firefox/Safari manifest)
4. **No automated selector recovery** — Manual maintenance required
5. **Service worker lifecycle** — 5min timeout may delay non-alarm tasks
6. **No i18n beyond English** — `language` setting exists but unused