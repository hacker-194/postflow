/**
 * fb-adapter Public API
 * All Facebook-specific DOM interaction logic in one module
 */

export { extractGroupsFromFeed, extractGroupsFromPage } from './extract-groups';
export { extractPostPreview, extractPostPreviewSync } from './extract-post';
export { performShare } from './perform-share';
export { detectAnomaly, getAnomalyDescription, shouldStopJob } from './detect-anomaly';
export {
  SELECTOR_VERSION,
  CURRENT_VERSION,
  getSelectors,
  type SelectorSet,
  type SelectorVersion,
} from './selectors';
export {
  type SelectorStrategy,
  type StrategyModule,
  type StrategyName,
  type AdapterConfig,
  type GroupExtractionResult,
  type PostExtractionResult,
  type ShareExecutionResult,
  type PerformShareContext,
  DEFAULT_ADAPTER_CONFIG,
  STRATEGY_MODULES,
} from './types';
