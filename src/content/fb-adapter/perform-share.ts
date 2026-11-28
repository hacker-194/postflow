/**
 * Share Automation Sequence
 * Multi-strategy execution of the share-to-group flow
 */

import type { PostPreview, ShareSettings, ShareResultData } from '../../shared/types';
import type {
  StrategyModule,
  StrategyName,
  PerformShareContext,
  ShareExecutionResult,
} from './types';
import { STRATEGY_MODULES } from './types';
import { detectAnomaly } from './detect-anomaly';
import { logger } from '../../shared/logger';

export async function performShare(
  postUrl: string,
  groupId: string,
  settings: ShareSettings,
  preview: PostPreview
): Promise<ShareResultData> {
  const context: PerformShareContext = { postUrl, groupId, settings, preview };
  const stepsCompleted: string[] = [];
  const triedStrategies: string[] = [];

  for (const strategyName of [
    'aria-label',
    'structural',
    'text-match',
    'shadow-dom',
  ] as StrategyName[]) {
    try {
      const module = await STRATEGY_MODULES[strategyName]();
      const result = await tryStrategy(module, context);
      if (result.success) {
        logger.info('fb-adapter', 'Share completed', {
          strategy: strategyName,
          steps: result.stepsCompleted,
        });
        return {
          success: true,
          stepsCompleted: result.stepsCompleted,
        };
      }
      triedStrategies.push(`${strategyName}: ${result.error}`);
      stepsCompleted.push(...result.stepsCompleted);
    } catch (error) {
      logger.warn('fb-adapter', 'Share strategy error', { strategy: strategyName, error });
      triedStrategies.push(`${strategyName} (exception)`);
    }
  }

  // Final anomaly check
  const anomaly = detectAnomaly(document);
  if (anomaly) {
    return {
      success: false,
      error: `Anomaly detected: ${anomaly.message}`,
      anomaly,
      stepsCompleted,
    };
  }

  return {
    success: false,
    error: `All strategies failed: ${triedStrategies.join('; ')}`,
    stepsCompleted,
  };
}

async function tryStrategy(
  module: StrategyModule,
  context: PerformShareContext
): Promise<ShareExecutionResult> {
  const stepsCompleted: string[] = [];

  // Step 1: Navigate to post URL if not already there
  if (
    !window.location.href.includes(
      context.postUrl.split('/posts/')[0]?.split('/videos/')[0]?.split('/reel/')[0] || ''
    )
  ) {
    window.location.href = context.postUrl;
    await sleep(2000);
  }
  stepsCompleted.push('navigated');

  // Step 2: Find and click share button
  const shareButton = await findAndClickShareButton(module);
  if (!shareButton) {
    return { success: false, error: 'Share button not found', stepsCompleted };
  }
  stepsCompleted.push('share-button-clicked');
  await sleep(1000);

  // Step 3: Wait for share dialog
  const shareDialog = await waitForShareDialog(module);
  if (!shareDialog) {
    return { success: false, error: 'Share dialog did not open', stepsCompleted };
  }
  stepsCompleted.push('share-dialog-opened');

  // Step 4: Check for anomalies after dialog opens
  const anomaly = detectAnomaly(document);
  if (anomaly) {
    return { success: false, error: `Anomaly: ${anomaly.message}`, anomaly, stepsCompleted };
  }

  // Step 5: Find group input and enter group ID
  const groupInput = await findGroupInput(module, shareDialog);
  if (!groupInput) {
    return { success: false, error: 'Group input not found', stepsCompleted };
  }
  groupInput.value = context.groupId;
  groupInput.dispatchEvent(new Event('input', { bubbles: true }));
  groupInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(500);
  stepsCompleted.push('group-entered');

  // Step 6: Wait for group suggestion/selection
  await sleep(800);

  // Step 7: Set caption if provided
  if (context.settings.caption) {
    const captionSet = await setCaption(module, shareDialog, context.settings.caption);
    if (!captionSet) {
      return { success: false, error: 'Caption input not found', stepsCompleted };
    }
    stepsCompleted.push('caption-set');
  }

  // Step 8: Set first comment if provided
  if (context.settings.firstComment) {
    const commentSet = await setFirstComment(module, shareDialog, context.settings.firstComment);
    if (!commentSet) {
      logger.warn('fb-adapter', 'First comment input not found, continuing');
    } else {
      stepsCompleted.push('first-comment-set');
    }
  }

  // Step 9: Find and click post/share button
  const postButton = await findPostButton(module, shareDialog);
  if (!postButton) {
    return { success: false, error: 'Post button not found', stepsCompleted };
  }
  postButton.click();
  await sleep(1500);
  stepsCompleted.push('post-button-clicked');

  // Step 10: Verify share succeeded (check for confirmation or dialog close)
  const verified = await verifyShareSuccess(module);
  if (!verified) {
    return { success: false, error: 'Share verification failed', stepsCompleted };
  }
  stepsCompleted.push('verified');

  return { success: true, stepsCompleted };
}

async function findAndClickShareButton(module: StrategyModule): Promise<HTMLButtonElement | null> {
  const strategy = module.createShareButtonStrategy();
  const button = strategy.select(document);
  if (button && strategy.validate(button)) {
    button.click();
    return button;
  }
  return null;
}

async function waitForShareDialog(
  module: StrategyModule,
  maxWait = 5000
): Promise<HTMLDivElement | null> {
  const strategy = module.createShareDialogStrategy();
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const dialog = strategy.select(document);
    if (dialog && strategy.validate(dialog)) {
      return dialog;
    }
    await sleep(100);
  }
  return null;
}

async function findGroupInput(
  module: StrategyModule,
  dialog: Element
): Promise<HTMLInputElement | null> {
  const strategy = module.createGroupInputStrategy();
  const input = strategy.select(dialog);
  if (input && strategy.validate(input)) {
    input.focus();
    return input;
  }
  return null;
}

async function setCaption(
  module: StrategyModule,
  dialog: Element,
  caption: string
): Promise<boolean> {
  const strategy = module.createCaptionInputStrategy();
  const input = strategy.select(dialog);
  if (!input || !strategy.validate(input)) return false;

  if (input.tagName === 'TEXTAREA') {
    (input as HTMLTextAreaElement).value = caption;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.textContent = caption;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(300);
  return true;
}

async function setFirstComment(
  module: StrategyModule,
  dialog: Element,
  comment: string
): Promise<boolean> {
  const strategy = module.createFirstCommentInputStrategy();
  const input = strategy.select(dialog);
  if (!input || !strategy.validate(input)) return false;

  input.value = comment;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  return true;
}

async function findPostButton(
  module: StrategyModule,
  dialog: Element
): Promise<HTMLButtonElement | null> {
  const strategy = module.createPostButtonStrategy();
  const button = strategy.select(dialog);
  if (button && strategy.validate(button)) {
    return button;
  }
  return null;
}

async function verifyShareSuccess(module: StrategyModule): Promise<boolean> {
  // Check if dialog closed or success message appeared
  const strategy = module.createShareDialogStrategy();

  // Wait a bit for the action to complete
  await sleep(1000);

  // If dialog is gone, likely succeeded
  const newDialog = strategy.select(document);
  if (!newDialog) return true;

  // Check for success indicators
  const successTexts = [
    'shared',
    'posted',
    'compartido',
    'partagé',
    'geteilt',
    'condiviso',
    '已分享',
    '공유됨',
    'paylaşıldı',
  ];
  const dialogText = newDialog.textContent?.toLowerCase() || '';
  if (successTexts.some(t => dialogText.includes(t))) return true;

  // Check for error indicators
  const errorTexts = [
    'error',
    'failed',
    "couldn't",
    'could not',
    'error',
    'erreur',
    'fehler',
    'errore',
  ];
  if (errorTexts.some(t => dialogText.includes(t))) return false;

  // Dialog still open without clear success - assume pending
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
