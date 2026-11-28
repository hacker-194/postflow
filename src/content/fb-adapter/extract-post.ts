/**
 * Post Preview Extraction
 * Multi-strategy extraction of post preview data from a post container
 */

import type { PostPreview, ExtractionResult } from '../../shared/types';
import type { StrategyModule, StrategyName, PostExtractionResult } from './types';
import { STRATEGY_MODULES } from './types';
import { logger } from '../../shared/logger';

export async function extractPostPreview(container: Element): Promise<PostExtractionResult> {
  const root = container || document;
  const triedStrategies: string[] = [];

  for (const strategyName of [
    'aria-label',
    'structural',
    'text-match',
    'shadow-dom',
  ] as StrategyName[]) {
    try {
      const module = await STRATEGY_MODULES[strategyName]();
      const result = await tryStrategy(module, root, strategyName);
      if (result.success && result.data) {
        logger.info('fb-adapter', 'Post preview extracted', {
          strategy: strategyName,
          hasText: !!result.data.text,
          imageCount: result.data.images?.length || 0,
        });
        return { ...result, strategyUsed: strategyName };
      }
      triedStrategies.push(strategyName);
    } catch (error) {
      logger.warn('fb-adapter', 'Post extraction strategy failed', {
        strategy: strategyName,
        error,
      });
      triedStrategies.push(`${strategyName} (error)`);
    }
  }

  return {
    success: false,
    error: `All strategies failed: ${triedStrategies.join(', ')}`,
    data: null,
    strategyUsed: 'none',
  };
}

async function tryStrategy(
  module: StrategyModule,
  root: Document | Element,
  _strategyName: string
): Promise<ExtractionResult<PostPreview>> {
  const authorStrategy = module.createPostAuthorStrategy();
  const textStrategy = module.createPostTextStrategy();
  const imagesStrategy = module.createPostImagesStrategy();
  const urlStrategy = module.createPostUrlStrategy();

  const author = authorStrategy.select(root);
  const text = textStrategy.select(root);
  const images = imagesStrategy.select(root);
  const url = urlStrategy.select(root);

  // Check if we got at least some meaningful data
  const hasData =
    (author && authorStrategy.validate(author)) ||
    (text && textStrategy.validate(text)) ||
    (images && imagesStrategy.validate(images)) ||
    (url && urlStrategy.validate(url));

  if (!hasData) {
    return { success: false, error: 'No post data found', data: null };
  }

  // Determine video/reel status
  let videoUrl: string | undefined;
  let isVideo = false;
  let isReel = false;

  const video = root.querySelector('video') as HTMLVideoElement;
  if (video?.src) {
    videoUrl = video.src;
    isVideo = true;
    isReel = root.querySelector('[href*="/reel/"]') !== null;
  }

  const preview: PostPreview = {
    url: url && urlStrategy.validate(url) ? url : window.location.href,
    authorName: author && authorStrategy.validate(author) ? author.name : 'Unknown',
    authorProfileUrl: author && authorStrategy.validate(author) ? author.url : '',
    text: text && textStrategy.validate(text) ? text : '',
    images: images && imagesStrategy.validate(images) ? images : [],
    videoUrl,
    isReel,
    isVideo,
    postedAt: Date.now(),
  };

  return { success: true, data: preview };
}

export function extractPostPreviewSync(container: Element | null): PostPreview | null {
  // Synchronous version for content script
  if (!container) return null;
  const root = container;

  // The first profile link is the avatar anchor and has no text, so take the first
  // one that actually names somebody.
  const authorLink =
    Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"], a[href*="/profile/"]')
    ).find(link => (link.textContent || '').trim().length > 0) ?? null;
  const authorName =
    authorLink?.textContent?.trim() ||
    root.querySelector('[role="heading"] strong, strong.x1lliihq')?.textContent?.trim() ||
    'Unknown';
  const authorProfileUrl = authorLink?.href || '';

  const textSelectors = [
    '[data-testid="post_message"]',
    '[data-ad-comet-preview="message"]',
    '.x1iorvi4',
    '[data-testid="post-message"]',
    // Facebook stopped tagging the message element; its first auto-direction text block
    // inside the post is the message itself.
    'div[dir="auto"]',
  ];
  let text = '';
  for (const sel of textSelectors) {
    const el = root.querySelector(sel);
    if (el?.textContent?.trim()) {
      text = el.textContent.trim();
      break;
    }
  }

  const images: string[] = [];
  const imgs = root.getElementsByTagName('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const src = img.getAttribute('src') || (img as HTMLImageElement).src;
    if (
      src &&
      (src.includes('scontent') || src.includes('fbcdn')) &&
      !src.includes('profile') &&
      !src.includes('emoji') &&
      src.length > 50
    ) {
      images.push(src);
    }
  }

  let videoUrl: string | undefined;
  let isVideo = false;
  let isReel = false;
  const video = root.querySelector('video') as HTMLVideoElement;
  if (video?.src) {
    videoUrl = video.src;
    isVideo = true;
    isReel = root.querySelector('[href*="/reel/"]') !== null;
  }

  const postLink = root.querySelector(
    'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]'
  ) as HTMLAnchorElement;
  // A comment link carries ?comment_id=..., which opens the comment instead of the post;
  // the post permalink is the bare path.
  const url = (postLink?.href || window.location.href).split('?')[0];

  return {
    url,
    authorName,
    authorProfileUrl,
    text,
    images,
    videoUrl,
    isReel,
    isVideo,
    postedAt: Date.now(),
  };
}
