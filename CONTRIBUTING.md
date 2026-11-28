# Contributing to Free Group Poster

Thank you for your interest in contributing! This project welcomes contributions from the community.

## Ways to Contribute

- **Bug Reports**: File an issue with steps to reproduce
- **Feature Requests**: Open an issue describing the feature
- **Code Changes**: Submit a pull request
- **Documentation**: Improve README, code comments, or guides
- **Testing**: Add unit tests or E2E tests
- **Selector Updates**: Facebook DOM changes break selectors — help us keep them current

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome 88+ (for testing)

### Setup

```bash
git clone https://github.com/yourusername/free-group-poster.git
cd free-group-poster
npm install
npm run dev          # Development build with watching
```

### Making Changes

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Run checks: `npm run lint && npm run format:check && npm run test`
4. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
5. Push and open a PR

## Code Conventions

### TypeScript

- Strict mode enabled — no `any` without justification
- Use `type` imports for type-only imports
- Explicit return types for public functions

### React Components

- Function components with explicit props interfaces
- PascalCase for component files: `ShareSheet.tsx`
- Use Zustand for global state, `useState` for local

### Styling

- CSS custom properties (variables) for theming
- Dark mode via `prefers-color-scheme`
- Mobile-first responsive design

### Messages (Background ↔ Content/Popup)

- All message types in `VALID_MESSAGE_TYPES` allowlist
- Sender ID verified: `sender.id === chrome.runtime.id`
- Payloads sanitized before storage

### Selectors (fb-adapter)

- All Facebook selectors in `src/content/fb-adapter/selectors.ts`
- Versioned selector registry for future compatibility
- Multi-strategy fallback: ARIA → structural → text → shadow DOM

## Testing

```bash
npm run test           # Unit tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run test:e2e       # E2E tests (Playwright)
```

### Writing Tests

- Unit tests: `src/test/**/*.test.ts`
- Test pure functions (security, storage, spintax, state-machine)
- Use HTML fixtures for fb-adapter tests
- Mock `chrome.*` APIs via `src/test/setup.ts`

## Selector Maintenance

Facebook changes DOM classes frequently. When selectors break:

1. Open Facebook in browser DevTools
2. Find the new class/attribute for the broken element
3. Update `src/content/fb-adapter/selectors.ts` (increment version)
4. Add fallback selectors to the strategy files
5. Test on multiple Facebook layouts (feed, groups, profile)

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add spintax weight support
fix: handle missing author in post extraction
docs: update README with installation steps
chore: update dependencies
refactor: extract share button logic to separate module
test: add extract-groups unit tests
```

## Pull Request Process

1. Ensure all checks pass (lint, format, tests)
2. Update documentation if needed
3. Add tests for new functionality
4. Keep PRs focused — one feature/fix per PR
5. Link related issues in PR description

## Code of Conduct

- Be respectful and inclusive
- No harassment, discrimination, or offensive behavior
- Focus on constructive feedback
- Help others learn and contribute

## Security

- Report security issues privately via GitHub Security Advisories
- Do not expose secrets or credentials
- All user input must be sanitized

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see LICENSE).
