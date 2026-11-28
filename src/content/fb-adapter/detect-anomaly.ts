/**
 * Anomaly Detection
 * Detects CAPTCHA, checkpoints, rate limits, and other blocking conditions
 */

import type { Anomaly, AnomalyType } from '../../shared/types';
import { ANOMALY_SELECTORS } from './selectors';
import { logger } from '../../shared/logger';

export function detectAnomaly(doc: Document = document): Anomaly | null {
  // Check each anomaly type in priority order (most severe first)
  const anomalyTypes: AnomalyType[] = [
    'captcha',
    'checkpoint',
    'rate-limit',
    'temporarily-blocked',
    'sharing-disabled',
    'admin-approval-required',
    'unexpected-dialog',
    'network-error',
  ];

  for (const type of anomalyTypes) {
    const anomaly = checkAnomalyType(doc, type);
    if (anomaly) {
      logger.warn('fb-adapter', 'Anomaly detected', {
        type: anomaly.type,
        message: anomaly.message,
      });
      return anomaly;
    }
  }

  // Check for network errors via performance observer
  const networkAnomaly = checkNetworkErrors();
  if (networkAnomaly) return networkAnomaly;

  return null;
}

function checkAnomalyType(doc: Document, type: AnomalyType): Anomaly | null {
  const selectors = ANOMALY_SELECTORS[type];
  if (!selectors || selectors.length === 0) return null;

  for (const selector of selectors) {
    try {
      // Handle :has-text pseudo-selector (not standard, need manual check)
      if (selector.includes(':has-text(')) {
        const textMatch = selector.match(/:has-text\("([^"]+)"\s*i?\)/);
        if (textMatch) {
          const searchText = textMatch[1].toLowerCase();
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent?.toLowerCase().includes(searchText)) {
              return {
                type,
                message: `Detected ${type}: "${searchText}" found in page`,
                recoverable: isRecoverable(type),
                selector,
              };
            }
          }
        }
        continue;
      }

      // Standard selector
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        // Verify at least one is visible
        for (const el of elements) {
          if (isVisible(el)) {
            return {
              type,
              message: `Detected ${type}: ${selector} matched visible element`,
              recoverable: isRecoverable(type),
              selector,
            };
          }
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return null;
}

function checkNetworkErrors(): Anomaly | null {
  // Check for failed requests in performance entries
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const recentFailures = entries.filter(entry => {
      const isRecent = Date.now() - entry.startTime < 10000; // Last 10 seconds
      const isFailed =
        entry.transferSize === 0 && entry.encodedBodySize === 0 && entry.decodedBodySize > 0;
      const isFacebookRequest =
        entry.name.includes('facebook.com') || entry.name.includes('fbcdn.net');
      return isRecent && isFailed && isFacebookRequest;
    });

    if (recentFailures.length >= 3) {
      return {
        type: 'network-error',
        message: `${recentFailures.length} recent Facebook network requests failed`,
        recoverable: true,
      };
    }
  } catch {
    // Performance API not available or restricted
  }
  return null;
}

function isVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

function isRecoverable(type: AnomalyType): boolean {
  // Non-recoverable anomalies - stop job immediately
  const nonRecoverable: AnomalyType[] = [
    'captcha',
    'checkpoint',
    'sharing-disabled',
    'admin-approval-required',
  ];
  return !nonRecoverable.includes(type);
}

export function getAnomalyDescription(anomaly: Anomaly): string {
  const descriptions: Record<AnomalyType, string> = {
    captcha:
      'Facebook is showing a CAPTCHA challenge. This usually means unusual activity was detected.',
    checkpoint:
      'Facebook requires identity verification (checkpoint). You may need to log in manually.',
    'rate-limit': 'Facebook has temporarily rate-limited your actions. Wait before trying again.',
    'temporarily-blocked':
      'Your sharing ability is temporarily blocked. This usually resolves in a few hours.',
    'sharing-disabled': 'Sharing is disabled for this group. You cannot share to this group.',
    'admin-approval-required':
      'This group requires admin approval for posts. Your share is pending review.',
    'unexpected-dialog': 'An unexpected dialog appeared. The share flow was interrupted.',
    'network-error': 'Network errors detected. Check your connection and try again.',
  };
  return descriptions[anomaly.type] || 'Unknown anomaly detected';
}

export function shouldStopJob(anomaly: Anomaly): boolean {
  return !anomaly.recoverable;
}
