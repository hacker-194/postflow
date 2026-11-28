import { chromium } from '@playwright/test';
import path from 'path';

const EXT = path.resolve('dist');
const PROFILE = path.resolve('.fb-live-profile');
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
  ],
});

const pages = ctx.pages();
const fb = pages[0] ?? (await ctx.newPage());
await fb.goto('https://www.facebook.com/groups/feed/', { waitUntil: 'domcontentloaded' });
console.log('FB-LIVE READY');
setInterval(() => {}, 1 << 30);
console.log('holding browser open');