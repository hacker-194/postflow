/**
 * Group Feed Extraction
 * Multi-strategy extraction of groups from Facebook Groups feed page
 */

import type { RawGroup, ExtractionResult } from '../../shared/types';
import type { StrategyModule, StrategyName, GroupExtractionResult } from './types';
import { STRATEGY_MODULES } from './types';
import { logger } from '../../shared/logger';

export async function extractGroupsFromFeed(): Promise<GroupExtractionResult> {
  const root = document;
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
      if (result.success && result.data && result.data.length > 0) {
        logger.info('fb-adapter', 'Groups extracted', {
          strategy: strategyName,
          count: result.data.length,
        });
        return {
          ...result,
          strategyUsed: strategyName,
          itemsExamined: result.data.length,
        };
      }
      triedStrategies.push(strategyName);
    } catch (error) {
      logger.warn('fb-adapter', 'Strategy failed', { strategy: strategyName, error });
      triedStrategies.push(`${strategyName} (error)`);
    }
  }

  return {
    success: false,
    error: `All strategies failed: ${triedStrategies.join(', ')}`,
    data: [],
    strategyUsed: 'none',
    itemsExamined: 0,
  };
}

async function tryStrategy(
  module: StrategyModule,
  root: Document | Element,
  _strategyName: string
): Promise<ExtractionResult<RawGroup[]>> {
  const feedItemStrategy = module.createGroupFeedItemStrategy();
  const groupNameStrategy = module.createGroupNameStrategy();
  const groupLinkStrategy = module.createGroupLinkStrategy();

  const items = feedItemStrategy.select(root);
  if (!items || items.length === 0) {
    return { success: false, error: 'No feed items found', data: [] };
  }

  const groups: RawGroup[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    try {
      const name = groupNameStrategy.select(item);
      if (!name || !groupNameStrategy.validate(name)) continue;

      const url = groupLinkStrategy.select(item);
      if (!url || !groupLinkStrategy.validate(url)) continue;

      const idMatch = url.match(/groups\/(\d+)/) || url.match(/groups\/([^\/?]+)/);
      const id = idMatch?.[1] || url;

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // Try to extract member count
      let memberCount: number | undefined;
      const memberText = item.textContent || '';
      const memberMatch = memberText.match(/(\d[\d,]*)\s*(members?|people)/i);
      if (memberMatch) {
        memberCount = parseInt(memberMatch[1].replace(/,/g, ''), 10);
      }

      groups.push({ id, name, url, memberCount });
    } catch {
      // Skip malformed items
    }
  }

  return {
    success: groups.length > 0,
    data: groups,
    error: groups.length === 0 ? 'No valid groups extracted' : undefined,
  };
}

export function extractGroupsFromPage(): RawGroup[] {
  // Synchronous version for background script injection
  // Uses only the most reliable selectors
  const groups: RawGroup[] = [];
  const seenIds = new Set<string>();

  const itemSelectors = [
    '[role="listitem"]',
    '[data-testid="group-card"]',
    '[data-pagelet="GroupsYouManageFeedUnit"] [role="listitem"]',
    'div[role="article"]',
  ];

  const nameSelectors = [
    '[role="heading"]',
    'strong',
    '[data-testid="group-name"]',
    '[dir="auto"]',
    'h3',
    'h4',
  ];

  const linkSelectors = ['a[href*="/groups/"]', 'a[href*="facebook.com/groups/"]'];

  for (const itemSel of itemSelectors) {
    const items = document.querySelectorAll(itemSel);
    for (const el of items) {
      let link: HTMLAnchorElement | null = null;
      for (const linkSel of linkSelectors) {
        link = el.querySelector(linkSel) as HTMLAnchorElement;
        if (link) break;
      }
      if (!link) continue;

      let name = '';
      for (const nameSel of nameSelectors) {
        const nameEl = el.querySelector(nameSel) as HTMLElement;
        if (nameEl?.textContent?.trim()) {
          name = nameEl.textContent.trim();
          break;
        }
      }

      const url = link.href;
      const idMatch = url.match(/groups\/(\d+)/) || url.match(/groups\/([^\/?]+)/);
      const id = idMatch?.[1] || url;

      if (name && name.length > 1 && !seenIds.has(id)) {
        seenIds.add(id);
        let memberCount: number | undefined;
        const memberText = el.textContent || '';
        const memberMatch = memberText.match(/(\d[\d,]*)\s*(members?|people)/i);
        if (memberMatch) {
          memberCount = parseInt(memberMatch[1].replace(/,/g, ''), 10);
        }
        groups.push({ id, name, url, memberCount });
      }
    }
    if (groups.length > 0) break;
  }

  return groups;
}
