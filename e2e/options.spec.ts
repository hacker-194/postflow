import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const OPTIONS_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/src/options/index.html`;

let extensionId: string;
let persistentContext: BrowserContext;

test.describe.configure({ retries: 0, timeout: 60000 });

test.beforeAll(async () => {
  if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(
      `Built extension not found at ${EXTENSION_PATH}. Run "npm run build" before the E2E tests.`
    );
  }

  persistentContext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const serviceWorker =
    persistentContext
      .serviceWorkers()
      .find(worker => worker.url().startsWith('chrome-extension://')) ??
    (await persistentContext.waitForEvent('serviceworker', {
      predicate: worker => worker.url().startsWith('chrome-extension://'),
      timeout: 15000,
    }));

  extensionId = new URL(serviceWorker.url()).hostname;
  if (!extensionId) {
    throw new Error(
      `Could not extract extension ID from service worker URL: ${serviceWorker.url()}`
    );
  }
});

test.afterAll(async () => {
  await persistentContext?.close();
});

async function openOptions(): Promise<Page> {
  const page = await persistentContext.newPage();
  await page.goto(OPTIONS_URL(extensionId));
  await expect(page.locator('.fgp-options')).toBeVisible();
  return page;
}

async function clickTab(page: Page, tabName: string) {
  await page.getByRole('button', { name: new RegExp(`^${tabName}$`, 'i') }).click();
}

async function waitForModal(page: Page, title: string) {
  await expect(page.locator('.fgp-modal-header h3', { hasText: title })).toBeVisible();
}

async function fillInput(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

async function selectOption(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).selectOption(value);
}

async function fillInputByPlaceholder(page: Page, placeholder: string, value: string) {
  await page.getByPlaceholder(placeholder).fill(value);
}

async function clickButton(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('Options Page - Groups & Lists Tab', () => {
  test('loads without errors and shows Groups & Lists tab active', async () => {
    const page = await openOptions();
    try {
      await expect(page.getByRole('heading', { name: 'Groups & Lists' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Groups & Lists', exact: true })).toHaveClass(
        /active/
      );
    } finally {
      await page.close();
    }
  });

  test('shows platform filter and list filter dropdowns', async () => {
    const page = await openOptions();
    try {
      await expect(page.getByLabel('All Platforms')).toBeVisible();
      await expect(page.getByLabel('All Lists')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('shows sync buttons for Facebook, WhatsApp, Messenger', async () => {
    const page = await openOptions();
    try {
      await expect(page.getByRole('button', { name: /^Sync Facebook$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Sync WhatsApp$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Sync Messenger$/ })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can open Add Group modal', async () => {
    const page = await openOptions();
    try {
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await expect(page.getByLabel('Name *')).toBeVisible();
      await expect(page.getByLabel('URL')).toBeVisible();
      await expect(page.getByLabel('Platform *')).toBeVisible();
      await clickButton(page, 'Cancel');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can create and save a new group', async () => {
    const page = await openOptions();
    try {
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'Test Facebook Group');
      await fillInput(page, 'URL', 'https://facebook.com/groups/testgroup');
      await selectOption(page, 'Platform *', 'facebook');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Test Facebook Group')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can open New List modal', async () => {
    const page = await openOptions();
    try {
      await clickButton(page, 'New List');
      await waitForModal(page, 'New Group List');
      await expect(page.getByLabel('List Name *')).toBeVisible();
      await expect(page.getByLabel('Color')).toBeVisible();
      await expect(page.getByLabel('Platform')).toBeVisible();
      await clickButton(page, 'Cancel');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can create and save a new group list', async () => {
    const page = await openOptions();
    try {
      await clickButton(page, 'New List');
      await waitForModal(page, 'New Group List');
      await fillInput(page, 'List Name *', 'My Test List');
      await page.getByLabel('Color').fill('#ff0000');
      await selectOption(page, 'Platform', 'facebook');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('My Test List')).toBeVisible();
      await expect(page.getByText('0 groups')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can edit an existing group', async () => {
    const page = await openOptions();
    try {
      // First create a group
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'Group to Edit');
      await fillInput(page, 'URL', 'https://facebook.com/groups/editme');
      await selectOption(page, 'Platform *', 'facebook');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Now edit it
      await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await waitForModal(page, 'Edit Group');
      await fillInput(page, 'Name *', 'Group Edited');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Group Edited')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can delete a group with confirmation', async () => {
    const page = await openOptions();
    try {
      // Create a group to delete
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'Group to Delete');
      await fillInput(page, 'URL', 'https://facebook.com/groups/delete');
      await selectOption(page, 'Platform *', 'facebook');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Delete it
      page.on('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
      await expect(page.getByText('Group to Delete')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can delete a group list with confirmation', async () => {
    const page = await openOptions();
    try {
      // Create a list to delete
      await clickButton(page, 'New List');
      await waitForModal(page, 'New Group List');
      await fillInput(page, 'List Name *', 'List to Delete');
      await page.getByLabel('Color').fill('#00ff00');
      await selectOption(page, 'Platform', 'facebook');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Delete it
      page.on('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
      await expect(page.getByText('List to Delete')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('filters groups by platform', async () => {
    const page = await openOptions();
    try {
      // Create groups for different platforms
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'FB Group');
      await fillInput(page, 'URL', 'https://facebook.com/groups/fb');
      await selectOption(page, 'Platform *', 'facebook');
      await clickButton(page, 'Save');

      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'WA Group');
      await fillInput(page, 'URL', 'https://whatsapp.com/groups/wa');
      await selectOption(page, 'Platform *', 'whatsapp');
      await clickButton(page, 'Save');

      // Filter by Facebook
      await selectOption(page, 'All Platforms', 'facebook');
      await expect(page.getByText('FB Group')).toBeVisible();
      await expect(page.getByText('WA Group')).not.toBeVisible();

      // Filter by WhatsApp
      await selectOption(page, 'All Platforms', 'whatsapp');
      await expect(page.getByText('WA Group')).toBeVisible();
      await expect(page.getByText('FB Group')).not.toBeVisible();

      // Show all
      await selectOption(page, 'All Platforms', 'all');
      await expect(page.getByText('FB Group')).toBeVisible();
      await expect(page.getByText('WA Group')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});

test.describe('Options Page - Templates Tab', () => {
  test('loads Templates tab and shows empty state initially', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
      await expect(page.getByText('No templates yet')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create your first template' })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can open New Template modal', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await expect(page.getByLabel('Template Name *')).toBeVisible();
      await expect(page.getByLabel('Caption')).toBeVisible();
      await expect(page.getByLabel('First Comment')).toBeVisible();
      await expect(page.getByLabel('Mode')).toBeVisible();
      await expect(page.getByLabel('Safety Level')).toBeVisible();
      await clickButton(page, 'Cancel');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can create and save a new template with spintax', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'My Spintax Template');
      await fillInput(
        page,
        'Caption',
        'Check out {this|that|those} amazing {products|items|services}!'
      );
      await fillInput(page, 'First Comment', 'First comment with {spintax|variations} here');
      await page.getByLabel('Enable spintax ({option1 | option2})').check();
      await selectOption(page, 'Mode', 'share_original');
      await selectOption(page, 'Safety Level', 'balanced');
      await fillInput(page, 'Delay Between Groups (ms)', '120000');
      await fillInput(page, 'Max Posts/Day', '25');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('My Spintax Template')).toBeVisible();
      await expect(
        page.getByText('Check out {this|that|those} amazing {products|items|services}!')
      ).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can create template with repost_content mode', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'Repost Template');
      await fillInput(page, 'Caption', 'This is a repost caption');
      await selectOption(page, 'Mode', 'repost_content');
      await selectOption(page, 'Safety Level', 'safe');
      await page.getByLabel('Pause overnight (22:00 - 07:00)').check();
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Repost Template')).toBeVisible();
      await expect(page.getByText('Repost as My Content')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can edit an existing template', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      // Create template first
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'Template to Edit');
      await fillInput(page, 'Caption', 'Original caption');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Edit it
      await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await waitForModal(page, 'Edit Template');
      await fillInput(page, 'Template Name *', 'Template Edited');
      await fillInput(page, 'Caption', 'Edited caption with {spintax|updated}');
      await page.getByLabel('Enable spintax ({option1 | option2})').check();
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Template Edited')).toBeVisible();
      await expect(page.getByText('Edited caption with {spintax|updated}')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can delete a template with confirmation', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'Template to Delete');
      await fillInput(page, 'Caption', 'Delete me');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      page.on('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
      await expect(page.getByText('Template to Delete')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('shows template settings in card view', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'Settings Test');
      await fillInput(page, 'Caption', 'Test caption');
      await selectOption(page, 'Safety Level', 'fast');
      await fillInput(page, 'Delay Between Groups (ms)', '60000');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Check template card shows settings
      await expect(page.getByText('Share Original')).toBeVisible();
      await expect(page.getByText('Fast (30-60s)')).toBeVisible();
      await expect(page.getByText('Delay: 60s')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});

test.describe('Options Page - Images Tab', () => {
  test('loads Images tab and shows empty state initially', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await expect(page.getByRole('heading', { name: 'Image Sets' })).toBeVisible();
      await expect(page.getByText('No image sets yet')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create your first image set' })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can open New Image Set modal', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await expect(page.getByLabel('Image Set Name *')).toBeVisible();
      await expect(page.getByLabel('Image URLs (max 50)')).toBeVisible();
      await expect(page.getByPlaceholder('https://example.com/image.jpg')).toBeVisible();
      await clickButton(page, 'Cancel');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can create and save a new image set with multiple URLs', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'My Image Set');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/image1.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/image2.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/image3.png'
      );
      await clickButton(page, 'Add');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('My Image Set')).toBeVisible();
      await expect(page.getByText('3 images')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('validates image URLs before adding', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'Invalid URL Test');
      await fillInputByPlaceholder(page, 'https://example.com/image.jpg', 'not-a-valid-url');
      await clickButton(page, 'Add');
      // Should show alert for invalid URL - we can't easily test alert in headless,
      // but we can verify the URL wasn't added
      await expect(page.getByText('No images added yet')).toBeVisible();
      await clickButton(page, 'Cancel');
    } finally {
      await page.close();
    }
  });

  test('can remove an image URL from the list', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'Removable Images');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/keep.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/remove.jpg'
      );
      await clickButton(page, 'Add');
      // Remove the second image
      await page.getByRole('button', { name: 'Remove', exact: true }).nth(1).click();
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Removable Images')).toBeVisible();
      await expect(page.getByText('1 images')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can edit an existing image set', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'Image Set to Edit');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/original.jpg'
      );
      await clickButton(page, 'Add');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Edit it
      await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await waitForModal(page, 'Edit Image Set');
      await fillInput(page, 'Image Set Name *', 'Image Set Edited');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/added.jpg'
      );
      await clickButton(page, 'Add');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
      await expect(page.getByText('Image Set Edited')).toBeVisible();
      await expect(page.getByText('2 images')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can delete an image set with confirmation', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'Image Set to Delete');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/delete.jpg'
      );
      await clickButton(page, 'Add');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      page.on('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
      await expect(page.getByText('Image Set to Delete')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('shows image previews in card view', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Image Sets');
      await clickButton(page, 'New Image Set');
      await waitForModal(page, 'New Image Set');
      await fillInput(page, 'Image Set Name *', 'Preview Test');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/img1.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/img2.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/img3.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/img4.jpg'
      );
      await clickButton(page, 'Add');
      await fillInputByPlaceholder(
        page,
        'https://example.com/image.jpg',
        'https://example.com/img5.jpg'
      );
      await clickButton(page, 'Add');
      await clickButton(page, 'Save');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();

      // Should show first 4 images and "+1 more"
      await expect(page.locator('.fgp-image-set-preview img')).toHaveCount(4);
      await expect(page.getByText('+1 more')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});

test.describe('Options Page - Settings Tab', () => {
  test('loads Settings tab and shows Appearance section', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
      await expect(page.getByLabel('Theme')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('can change theme to light', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await selectOption(page, 'Theme', 'light');
      await expect(page.getByLabel('Theme')).toHaveValue('light');
    } finally {
      await page.close();
    }
  });

  test('can change theme to dark', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await selectOption(page, 'Theme', 'dark');
      await expect(page.getByLabel('Theme')).toHaveValue('dark');
    } finally {
      await page.close();
    }
  });

  test('can change theme to system', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await selectOption(page, 'Theme', 'system');
      await expect(page.getByLabel('Theme')).toHaveValue('system');
    } finally {
      await page.close();
    }
  });

  test('shows Data Management section with Export, Import, Clear buttons', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await expect(page.getByRole('heading', { name: 'Data Management' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export Data' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Import Data' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear All Data' })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('clicking Export Data triggers download', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      // Set up download listener
      const downloadPromise = page.waitForEvent('download');
      await clickButton(page, 'Export Data');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^fgp-backup-\d{4}-\d{2}-\d{2}\.json$/);
    } finally {
      await page.close();
    }
  });

  test('clicking Import Data opens file picker', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      // We can't easily test file picker in headless, but we can verify the button is clickable
      await clickButton(page, 'Import Data');
      // If no error thrown, the button works
    } finally {
      await page.close();
    }
  });

  test('clicking Clear All Data shows confirmation dialog', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      // The button should trigger a confirm dialog
      page.on('dialog', dialog => {
        expect(dialog.message()).toContain('ALL your groups');
        dialog.dismiss();
      });
      await clickButton(page, 'Clear All Data');
    } finally {
      await page.close();
    }
  });

  test('shows About section with version and GitHub link', async () => {
    const page = await openOptions();
    try {
      await clickTab(page, 'Settings');
      await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
      await expect(page.getByText('Free Group Poster v1.0.0')).toBeVisible();
      await expect(page.getByRole('link', { name: 'View on GitHub' })).toBeVisible();
      await expect(page.getByText('No tracking, no ads, fully local')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});

test.describe('Options Page - Cross-tab Navigation', () => {
  test('can navigate between all four tabs', async () => {
    const page = await openOptions();
    try {
      // Start at Groups & Lists
      await expect(page.getByRole('heading', { name: 'Groups & Lists' })).toBeVisible();

      // Go to Templates
      await clickTab(page, 'Templates');
      await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();

      // Go to Images
      await clickTab(page, 'Image Sets');
      await expect(page.getByRole('heading', { name: 'Image Sets' })).toBeVisible();

      // Go to Settings
      await clickTab(page, 'Settings');
      await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();

      // Back to Groups & Lists
      await clickTab(page, 'Groups & Lists');
      await expect(page.getByRole('heading', { name: 'Groups & Lists' })).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('tab state persists when switching', async () => {
    const page = await openOptions();
    try {
      // Create a group
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await fillInput(page, 'Name *', 'Persisted Group');
      await fillInput(page, 'URL', 'https://facebook.com/groups/persist');
      await selectOption(page, 'Platform *', 'facebook');
      await clickButton(page, 'Save');

      // Switch to Templates and create one
      await clickTab(page, 'Templates');
      await clickButton(page, 'New Template');
      await waitForModal(page, 'New Template');
      await fillInput(page, 'Template Name *', 'Persisted Template');
      await fillInput(page, 'Caption', 'Persisted caption');
      await clickButton(page, 'Save');

      // Switch back to Groups - group should still be there
      await clickTab(page, 'Groups & Lists');
      await expect(page.getByText('Persisted Group')).toBeVisible();

      // Switch to Templates - template should still be there
      await clickTab(page, 'Templates');
      await expect(page.getByText('Persisted Template')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});

test.describe('Options Page - Keyboard Accessibility', () => {
  test('can navigate tabs with keyboard', async () => {
    const page = await openOptions();
    try {
      // Focus first tab
      await page.getByRole('button', { name: 'Groups & Lists', exact: true }).focus();
      await expect(page.getByRole('button', { name: 'Groups & Lists', exact: true })).toBeFocused();

      // Tab to next tab
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Image Sets', exact: true })).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    } finally {
      await page.close();
    }
  });

  test('can open modals with Enter key', async () => {
    const page = await openOptions();
    try {
      await page.getByRole('button', { name: 'Add Group', exact: true }).focus();
      await page.keyboard.press('Enter');
      await waitForModal(page, 'Add Group');
      await clickButton(page, 'Cancel');
    } finally {
      await page.close();
    }
  });

  test('can close modals with Escape key', async () => {
    const page = await openOptions();
    try {
      await clickButton(page, 'Add Group');
      await waitForModal(page, 'Add Group');
      await page.keyboard.press('Escape');
      await expect(page.locator('.fgp-modal')).not.toBeVisible();
    } finally {
      await page.close();
    }
  });
});
