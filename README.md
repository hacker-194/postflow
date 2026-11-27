<p align="center">
  <img src="public/icons/icon128.png" alt="PostFlow Logo" width="128" height="128">
  <h1 align="center">PostFlow</h1>
  <p align="center"><strong>Free, open-source Chrome extension for sharing posts to multiple Facebook Groups, WhatsApp Groups & Messenger.</strong></p>
  <p align="center">Advanced scheduling · Spintax · Image rotation · Templates · Zero tracking · Fully local</p>
</p>

<p align="center">
  <a href="https://github.com/hacker-194/postflow/releases/latest"><img src="https://img.shields.io/github/v/release/hacker-194/postflow?style=for-the-badge&label=Latest%20Release&color=1877f2" alt="Latest Release"></a>
  <a href="https://github.com/hacker-194/postflow/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/hacker-194/postflow/ci.yml?branch=main&style=for-the-badge&logo=github&label=Build" alt="Build Status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript" alt="TypeScript"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18.3-61dafb?style=for-the-badge&logo=react" alt="React"></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-5.4-646cff?style=for-the-badge&logo=vite" alt="Vite"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest-V3-4285f4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#platforms">Platforms</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#options-page">Options</a> •
  <a href="#safety">Safety</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why PostFlow?

<table>
<tr>
<th width="30%"></th>
<th width="35%">Paid Competitors ($9.99–99/mo)</th>
<th width="35%"><strong>PostFlow (Free Forever)</strong></th>
</tr>
<tr><td><strong>Bulk group posting</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Scheduling & queues</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Spintax (caption rotation)</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Image rotation</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Post templates</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Group sync/import</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Safety delays (3 levels)</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Overnight pause</strong></td><td>✅</td><td>✅</td></tr>
<tr><td><strong>Daily post limits</strong></td><td>✅</td><td>✅ (up to 500)</td></tr>
<tr><td><strong>Import/Export data</strong></td><td>Sometimes</td><td>✅ Full JSON backup</td></tr>
<tr><td><strong>Dark mode</strong></td><td>Sometimes</td><td>✅ System/Light/Dark</td></tr>
<tr><td><strong>WhatsApp Web support</strong></td><td>✅ ($$$)</td><td>✅ Built-in</td></tr>
<tr><td><strong>Messenger support</strong></td><td>✅ ($$$)</td><td>✅ Built-in</td></tr>
<tr><td><strong>No account required</strong></td><td>❌</td><td>✅</td></tr>
<tr><td><strong>Zero tracking/analytics</strong></td><td>❌</td><td>✅</td></tr>
<tr><td><strong>Open source (MIT)</strong></td><td>❌</td><td>✅</td></tr>
<tr><td><strong>Annual cost</strong></td><td><strong>$120–1,188</strong></td><td><strong>$0</strong></td></tr>
</table>

---

## Platforms

| Platform            | Status              | Features                                                                    |
| ------------------- | ------------------- | --------------------------------------------------------------------------- |
| **Facebook Groups** | ✅ **Full Support** | Share Original, Post as Me, Group Sync, Scheduling, Spintax, Image Rotation |
| **WhatsApp Web**    | ✅ **Full Support** | Forward to Groups, Share Sheet, Group Sync, Caption Templates               |
| **Messenger**       | ✅ **Full Support** | Share to Groups, Share Sheet, Group Sync, Caption Templates                 |

> **Note**: Instagram is not supported due to API limitations and lack of web-based group sharing.

---

## Features

### Core Sharing

- **Multi-platform posting** — Share to Facebook Groups, WhatsApp Groups, and Messenger from one extension
- **Two modes (Facebook)** — _Share Original_ (native share dialog) or _Post as Me_ (composer injection)
- **WhatsApp forwarding** — Forward messages/media to multiple groups with one click
- **Messenger sharing** — Share posts to Messenger groups seamlessly
- **Group lists** — Organize groups into named, color-coded lists per platform
- **One-click group import** — Sync all your groups from Facebook/WhatsApp/Messenger pages

### Content Tools

- **Spintax support** — `{Hello|Hi|Hey} {world|everyone|friends}` rotates per post
- **Image sets** — Upload multiple images; rotates one per group
- **Templates** — Save reusable captions with default settings per platform
- **Caption editor** — Live character count, emoji picker, line breaks preserved
- **First comment** — Add a pinned first comment (Facebook)

### Smart Scheduling

- **Queue system** — Schedule posts for future dates/times across all platforms
- **Three safety levels** — Fast (10–20s) / Balanced (30–60s) / Safe (90–180s) + jitter
- **Overnight pause** — Auto-pauses sharing during configurable hours (default 22:00–07:00)
- **Daily limits** — Cap at 200 posts/day (configurable up to 500)
- **Progress tracking** — Real-time progress in popup (groups completed/total/failed)

### Data & Privacy

- **Local-first** — All data in IndexedDB on your device
- **Full export/import** — JSON backup/restore (lists, templates, images, history, settings)
- **No account, no cloud, no tracking** — Works offline after install
- **Open source** — MIT licensed, audit the code yourself
- **Opt-in only** — Analytics checkbox in Settings (disabled by default)

### User Experience

- **Dark/Light/System themes** — Respects OS preference or force your choice
- **Responsive UI** — Works on mobile, tablet, desktop option pages
- **Keyboard accessible** — Full tab navigation, ARIA labels
- **Notifications** — Desktop + sound alerts for completion/errors
- **Per-platform settings** — Configure safety, scheduling separately for each platform

---

## Installation

### Option 1: Chrome Web Store (Recommended)

_Coming soon — pending $5 developer fee and review_

### Option 2: Load Unpacked (Immediate)

```bash
# 1. Clone the repository
git clone https://github.com/hacker-194/postflow.git
cd postflow

# 2. Install dependencies & build
npm ci && npm run build

# 3. Load in Chrome
# chrome://extensions → Developer mode → Load unpacked → select ./dist
```

### Option 3: Direct Download

1. Go to [Releases](https://github.com/hacker-194/postflow/releases/latest)
2. Download `postflow-v1.0.0.zip`
3. Extract → `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

---

## Quick Start

### Facebook Groups

1. **Install** the extension (see above)
2. **Open Facebook** and go to any post you want to share
3. Click **"Share to Groups"** button (appears next to Facebook's Share button)
4. Select a **Group List** (or create one in Options → Lists)
5. Add a caption (optional — supports Spintax: `{A|B|C}`)
6. Choose **Share Now** or **Schedule for Later**
7. Track progress in the extension **popup** (toolbar icon)

### WhatsApp Groups

1. Open **web.whatsapp.com**
2. Navigate to a chat with the message you want to forward
3. Click the **PostFlow forward button** (added next to message actions)
4. Select your **WhatsApp Group List**
5. Add caption if needed
6. Click **Forward to Groups**

### Messenger Groups

1. Open **www.messenger.com**
2. Navigate to a conversation
3. Click the **PostFlow share button**
4. Select your **Messenger Group List**
5. Add caption if needed
6. Click **Share to Groups**

---

## Options Page

Right-click the extension icon → **Options** (or `chrome-extension://<id>/options.html`)

| Tab           | Purpose                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| **Lists**     | Create/edit group lists with custom colors per platform (Facebook/WhatsApp/Messenger) |
| **Groups**    | View imported groups; click **Sync Groups** to refresh from each platform             |
| **Templates** | Save caption templates with default mode/safety level per platform                    |
| **Images**    | Create image sets for automatic rotation                                              |
| **Settings**  | Theme, notifications, share button position, privacy controls, platform defaults      |

### Screenshots

<p align="center">
  <img src="docs/screenshots/options-lists.png" alt="Options - Lists Tab" width="45%">
  <img src="docs/screenshots/options-groups.png" alt="Options - Groups Tab" width="45%">
</p>
<p align="center">
  <img src="docs/screenshots/options-templates.png" alt="Options - Templates Tab" width="45%">
  <img src="docs/screenshots/options-settings.png" alt="Options - Settings Tab" width="45%">
</p>
<p align="center">
  <img src="docs/screenshots/popup-dashboard.png" alt="Popup Dashboard" width="45%">
  <img src="docs/screenshots/share-sheet.png" alt="Share Sheet Modal" width="45%">
</p>

> **Note**: Screenshots will be added before Chrome Web Store submission. Contribute screenshots via PR!

---

## Safety Features

PostFlow includes multiple layers to protect your accounts:

| Feature                  | Description                                               | Default     |
| ------------------------ | --------------------------------------------------------- | ----------- |
| **Safety Levels**        | Fast (10–20s), Balanced (30–60s), Safe (90–180s) + jitter | Balanced    |
| **Overnight Pause**      | Auto-pauses sharing during configurable hours             | 22:00–07:00 |
| **Daily Limit**          | Max posts per 24h (configurable up to 500)                | 200         |
| **Randomized Jitter**    | Adds ±30% randomness to every delay                       | Enabled     |
| **Progress Persistence** | Survives browser restarts, continues queue                | Automatic   |
| **Per-Platform Config**  | Separate safety settings for FB/WA/Messenger              | Independent |

> ⚠️ **Disclaimer**: This tool automates interactions with Facebook, WhatsApp, and Messenger. Excessive use may trigger spam filters. Use responsibly, respect group rules, and stay within safe limits. Not affiliated with Meta Platforms, Inc.

---

## Privacy

- **No analytics** — No tracking pixels, no telemetry, no external requests except target platform domains
- **Local storage only** — IndexedDB on your device; nothing leaves your browser
- **No account** — No signup, no login, no email required
- **Open source** — Full code audit at [github.com/hacker-194/postflow](https://github.com/hacker-194/postflow)
- **Opt-in only** — Analytics checkbox in Settings (disabled by default)
- **No permissions abuse** — Host permissions limited to facebook.com, whatsapp.com, messenger.com only

Full policy: [PRIVACY.md](PRIVACY.md)

---

## Tech Stack

| Layer         | Technology                     |
| ------------- | ------------------------------ |
| **Extension** | Manifest V3 (Chrome 88+)       |
| **Framework** | React 18.3 + TypeScript 5.6    |
| **Build**     | Vite 5.4                       |
| **Storage**   | IndexedDB via `idb` 8.0        |
| **State**     | Zustand 4.5                    |
| **Icons**     | Lucide React 0.46              |
| **Dates**     | date-fns 3.6                   |
| **Testing**   | Vitest 2.1 + Playwright 1.46   |
| **Linting**   | ESLint 9 (flat) + Prettier 3.3 |

### Architecture

```
src/
├── background/     # Service worker — scheduling, sharing, alarms
├── content/        # Content scripts — platform DOM injection, share sheets
│   ├── index.ts          # Facebook Groups
│   ├── whatsapp.ts       # WhatsApp Web
│   └── messenger.ts      # Messenger
├── popup/          # React popup — dashboard, lists, history, settings
├── options/        # React options page — lists, templates, images, settings
├── shared/         # Types, storage, security, logger
└── test/           # Test utilities
```

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
git clone https://github.com/hacker-194/postflow.git
cd postflow
npm ci
npm run prepare   # Sets up Husky pre-commit hooks
npm run build
```

### Commands

| Command                 | Description                      |
| ----------------------- | -------------------------------- |
| `npm run dev`           | Dev build with file watching     |
| `npm run build`         | Production build → `dist/`       |
| `npm run preview`       | Preview production build locally |
| `npm run lint`          | ESLint (strict)                  |
| `npm run lint:fix`      | Auto-fix lint issues             |
| `npm run format`        | Prettier format                  |
| `npm run format:check`  | Check formatting                 |
| `npm run test`          | Unit tests (Vitest)              |
| `npm run test:watch`    | Watch mode                       |
| `npm run test:coverage` | Coverage report                  |
| `npm run test:e2e`      | E2E tests (Playwright)           |

### Code Quality

- **TypeScript strict mode** — No implicit `any`
- **ESLint flat config** — React + TypeScript recommended rules
- **Prettier** — Enforced via Husky pre-commit
- **Conventional Commits** — `feat:`, `fix:`, `chore:`, etc.

---

## Testing

```bash
# Unit tests (29 tests, security + storage)
npm run test

# E2E tests (requires built extension + Chromium)
npm run build
npm run test:e2e

# CI/headless environments
xvfb-run --auto-servernum npm run test:e2e
```

---

## Release Process

```bash
# Bump version (patch/minor/major)
npm version patch

# Push with tags
git push --follow-tags

# GitHub Actions builds & attaches extension.zip to Release
```

---

## Project Structure

```
├── dist/                    # Production build (load unpacked from here)
├── public/
│   ├── icons/               # 16/32/48/128px + SVG logo
│   └── manifest.json        # MV3 manifest
├── src/
│   ├── background/          # Service worker
│   ├── content/             # Content scripts (ISOLATED world)
│   ├── popup/               # Popup UI
│   ├── options/             # Options page UI
│   ├── shared/              # Types, storage, security, logger
│   └── test/                # Test setup
├── e2e/                     # Playwright E2E tests
├── .github/workflows/       # CI/CD
├── CLAUDE.md                # Project onboarding guide
├── COMPETITIVE_ANALYSIS.md  # vs paid tools
├── design-tokens.json       # Design system tokens
├── PRIVACY.md               # Privacy policy
└── LICENSE                  # MIT
```

---

## Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/amazing-feature`
3. **Develop** with tests: `npm run test:watch`
4. **Validate**: `npm run lint && npm run test && npm run build`
5. **Commit** with conventional messages: `git commit -m "feat: add amazing feature"`
6. **Push** and open a **Pull Request**

### Areas Welcome

- Firefox/Safari WebExtensions polyfill
- E2E test coverage (Playwright)
- i18n / translations
- Selector resilience for platform DOM changes
- Recurring/evergreen posts
- Accessibility improvements
- More platform integrations (LinkedIn, Telegram, etc.)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Disclaimer

**PostFlow is not affiliated with, endorsed by, or connected to Meta Platforms, Inc. (Facebook, WhatsApp, Messenger).**

This extension automates interactions with Meta's web interfaces. Use responsibly and in accordance with [Facebook's Terms of Service](https://www.facebook.com/terms.php), [WhatsApp Terms](https://www.whatsapp.com/legal/terms-of-service), and [Messenger Terms](https://www.messenger.com/terms). Excessive sharing may result in temporary or permanent account restrictions. The authors accept no liability for consequences of misuse.

---

<p align="center">
  <strong>Built with ❤️ for the community. Free forever. No ads. No tracking.</strong><br>
  <a href="https://github.com/hacker-194/postflow">★ Star on GitHub</a> •
  <a href="https://github.com/hacker-194/postflow/issues">Report Bug</a> •
  <a href="https://github.com/hacker-194/postflow/discussions">Request Feature</a>
</p>
