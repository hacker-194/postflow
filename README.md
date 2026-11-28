# Free Group Poster

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)

A free, open-source Chrome extension for sharing posts to multiple Facebook groups. Built as an alternative to commercial "MultiGroupPoster" extensions.

## Features

- **Share to Multiple Groups** — Select multiple Facebook groups and share a post to all of them sequentially
- **Spintax Support** — Use `{option1|option2|option3}` syntax for automatic content variation
- **Scheduled Sharing** — Schedule shares for future dates/times
- **Safety First** — Conservative delays (30-120s), daily limits, overnight pause (22:00-07:00)
- **Multi-Platform** — Facebook Groups, WhatsApp Groups, Messenger Groups
- **Templates & Images** — Save reusable caption templates and image sets
- **History & Analytics** — Track sharing history with success/failure rates
- **Fully Local** — No external servers, no tracking, no analytics (opt-in only)
- **Open Source** — MIT licensed, community-driven

## Installation

### From Chrome Web Store (Coming Soon)

_Coming soon_

### Developer Mode (Current)

1. Clone this repository
2. Run `npm install && npm run build`
3. Open Chrome → Extensions → Enable "Developer mode"
4. Click "Load unpacked" → Select the `dist` folder

## Usage

1. **Create Group Lists** — Open the extension options page and create group lists for Facebook, WhatsApp, or Messenger
2. **Sync Groups** — Navigate to Facebook Groups, WhatsApp Web, or Messenger and click "Sync" to import your groups
3. **Share a Post** — On any Facebook post, click the "Share to Groups" button (injected next to Facebook's share button)
4. **Configure & Share** — Select groups, add caption (with Spintax if desired), choose share mode, and click "Share Now"

## Spintax Syntax

Use `{option1|option2|option3}` for random selection:

```
Check out {this amazing|our new|the latest} product!
```

Weighted options (higher weight = more frequent):

```
{option1:3|option2:1}  // option1 appears 75% of the time
```

Nested spintax:

```
{Check out {our|the} new {product|feature}!}
```

## Safety Features

- **Conservative Delays**: 30-120 seconds between groups (configurable)
- **Daily Limit**: Maximum 200 posts per day (configurable)
- **Overnight Pause**: Automatic pause 22:00-07:00 local time
- **Anomaly Detection**: Detects CAPTCHA, checkpoints, rate limits, blocked actions
- **Checkpoint Recovery**: Resumes from last successful group after browser restart

## Architecture

```
src/
├── background/     # Service worker (MV3) - scheduling, sharing, storage
├── content/        # Content script - Facebook DOM injection, share sheet
├── popup/          # React popup UI - dashboard, lists, history, settings
├── options/        # React options page - lists, templates, images, settings
├── shared/         # Shared types, storage, security, logger
│   ├── types.ts       # Core interfaces
│   ├── storage.ts     # IndexedDB wrapper
│   ├── security.ts    # Sanitization, validation
│   └── logger.ts      # Structured logging
└── fb-adapter/     # Facebook DOM abstraction layer
    ├── strategies/    # Selector strategies (ARIA, structural, text, shadow DOM)
    ├── extract-post.ts
    ├── extract-groups.ts
    ├── perform-share.ts
    └── detect-anomaly.ts
```

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Development build with file watching
npm run build        # Production build to dist/
npm run preview      # Preview production build
npm run lint         # ESLint (strict)
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Prettier format
npm run format:check # Check formatting
npm run test         # Unit tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run test:e2e     # E2E tests (Playwright)
```

## Project Structure

| Layer     | Technology                    |
| --------- | ----------------------------- |
| Language  | TypeScript 5.6+               |
| Framework | React 18.3                    |
| Build     | Vite 5.4 + @crxjs/vite-plugin |
| Extension | Manifest V3                   |
| Storage   | IndexedDB (idb 8.0)           |
| State     | Zustand 4.5                   |
| Icons     | Lucide React 0.46             |
| Dates     | date-fns 3.6                  |
| Testing   | Vitest 2.1 + Playwright 1.46  |

## Security

- All user input sanitized via `security.ts` exports
- Message validation: Allowlist + sender ID + payload sanitization
- No external requests except Facebook domains
- No secrets in code — config via user settings only
- Local-only data — IndexedDB, no sync, no analytics (opt-in only)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Privacy

See [PRIVACY.md](PRIVACY.md) for privacy policy.

## Disclaimer

This extension is not affiliated with, endorsed by, or connected to Facebook/Meta, WhatsApp, or Messenger. Use responsibly and in accordance with each platform's Terms of Service. The authors are not responsible for any account restrictions or bans resulting from use of this extension.
