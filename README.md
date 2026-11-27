# Free Group Poster

Free, open-source Chrome extension for sharing posts to multiple Facebook groups. Advanced features, no tracking, fully local.

## Features

- **Share to Multiple Groups** — Select groups from your saved lists and share with one click
- **Scheduled Sharing** — Schedule posts for later with overnight pause and daily limits
- **Spintax Support** — Rotate captions with `{option1|option2|option3}` syntax
- **Image Sets** — Rotate images across posts for variety
- **Post Templates** — Save reusable caption templates with settings
- **Group Sync** — Import your Facebook groups with one click
- **Safety Levels** — Fast, Balanced, Safe modes with randomized delays
- **Import/Export** — Full data portability (JSON backup/restore)
- **Dark Mode** — System, light, or dark theme
- **Privacy First** — No tracking, no external servers, all data local

## Installation

### From Chrome Web Store (Coming Soon)
*Pending review — $5 developer fee required*

### Load Unpacked (Development)
1. Download or clone this repository
2. Run `npm ci && npm run build`
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** → select the `dist/` folder

## Usage

1. **Open Facebook** and navigate to any post
2. Click the **"Share to Groups"** button (appears next to Facebook's share button)
3. Select groups from your lists or create a new list in Options
4. Add caption (optional, supports Spintax)
5. Choose **Share Now** or **Schedule** for later
6. Monitor progress in the extension popup

## Options Page

Right-click the extension icon → **Options** to access:
- **Lists** — Create and manage group lists
- **Groups** — View/sync imported Facebook groups
- **Templates** — Save reusable post templates
- **Images** — Create image sets for rotation
- **Settings** — Theme, notifications, share button position, privacy

## Safety Features

| Level | Delay Range | Use Case |
|-------|-------------|----------|
| Fast | 10-20s + base | Testing, small lists |
| Balanced | 30-60s + base | Daily use (default) |
| Safe | 90-180s + base | Large lists, new accounts |

- **Overnight Pause** — Automatically pauses 22:00–07:00 (configurable)
- **Daily Limit** — Max 200 posts/day (configurable, max 500)
- **Jitter** — Random delay added to each interval

## Development

### Prerequisites
- Node.js 20+
- npm 10+

### Setup
```bash
npm ci
npm run prepare  # Sets up husky pre-commit hooks (optional)
npm run build
```

### Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Development build with file watching |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint (strict, fails on warnings) |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:watch` | Watch mode for unit tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run E2E tests with Playwright |
| `npm run test:e2e:ui` | Open Playwright UI |

### Testing
```bash
# Unit tests
npm run test

# E2E tests (requires a built extension and headed Chromium)
npm run build
npm run test:e2e

# On headless Linux machines / CI runners, provide a virtual display
xvfb-run --auto-servernum npm run test:e2e
```

### Code Quality
- **TypeScript**: Strict mode enabled, no `any` without explicit justification
- **ESLint**: Flat config with React/TypeScript recommended rules
- **Prettier**: Consistent formatting enforced via pre-commit hooks
- **Husky**: Pre-commit runs lint-staged on changed files

### Release Process
```bash
npm run version:patch  # or minor/major
git push --follow-tags
# GitHub Actions creates release with extension.zip
```

### Project Structure
```
src/
├── background/      # Service worker (MV3)
├── content/         # Content script (Facebook injection)
├── popup/           # React popup UI
├── options/         # React options page
├── shared/          # Shared types, storage, security, logger
└── test/            # Test setup and utilities
e2e/                 # Playwright E2E tests
dist/                # Production build output
.github/workflows/   # CI/CD pipelines
```

## Privacy

- **No analytics** — No tracking, no external requests except to facebook.com
- **Local storage** — All data in IndexedDB on your device
- **Open source** — Audit the code yourself
- **No account required** — Works immediately

Full policy: [PRIVACY.md](PRIVACY.md)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run `npm run lint && npm run test && npm run build`
5. Submit a PR

## Disclaimer

This extension is not affiliated with, endorsed by, or connected to Facebook/Meta. Use responsibly and in accordance with Facebook's Terms of Service and Community Standards. Excessive sharing may result in account restrictions.
