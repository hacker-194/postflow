/**
 * Share Job State Machine
 * Typed, exhaustive transitions with runtime validation.
 */

import type { ShareJobState, StateEvent, FailureReason, GroupResult, JobCheckpoint } from './types';

// Valid transitions: from -> { trigger -> to }
const TRANSITIONS: Record<string, Record<string, string>> = {
  queued: {
    'alarm-tick': 'opening',
    'user-cancelled': 'failed',
  },
  opening: {
    'share-dialog-opened': 'selecting-group',
    'anomaly-detected': 'failed',
    'share-dialog-failed': 'failed',
    'user-cancelled': 'failed',
  },
  'selecting-group': {
    'group-selected': 'captioning',
    'group-not-found': 'failed',
    'anomaly-detected': 'failed',
    'user-cancelled': 'failed',
    // The executor shares one group per pass, re-opening the dialog each time and
    // finishing a group in a single step.
    'share-dialog-opened': 'selecting-group',
    success: 'selecting-group',
  },
  captioning: {
    'caption-set': 'posting',
    'anomaly-detected': 'failed',
    'user-cancelled': 'failed',
  },
  posting: {
    'post-clicked': 'verifying',
    'post-button-failed': 'failed',
    'anomaly-detected': 'failed',
    'user-cancelled': 'failed',
  },
  verifying: {
    success: 'selecting-group', // Next group (payload: nextGroupId)
    'all-groups-done': 'done',
    'anomaly-detected': 'failed',
    'daily-limit-reached': 'failed',
    'user-cancelled': 'failed',
  },
  done: {},
  failed: {},
  interrupted: {},
};

// Wildcard transitions (apply from any state)
const WILDCARD_TRANSITIONS: Record<string, string> = {
  'sw-restart': 'interrupted',
  'browser-close': 'interrupted',
};

export function transition(state: ShareJobState, event: StateEvent): ShareJobState {
  const fromStatus = state.status;

  // Check wildcard first
  if (WILDCARD_TRANSITIONS[event.type]) {
    const toStatus = WILDCARD_TRANSITIONS[event.type];
    return createState(toStatus, state, event);
  }

  // Check specific transitions
  const fromTransitions = TRANSITIONS[fromStatus];
  if (!fromTransitions) {
    throw new Error(`Invalid state: ${fromStatus}`);
  }

  const toStatus = fromTransitions[event.type];
  if (!toStatus) {
    throw new Error(`Invalid transition: ${fromStatus} --${event.type}--> ?`);
  }

  return createState(toStatus, state, event);
}

function createState(toStatus: string, fromState: ShareJobState, event: StateEvent): ShareJobState {
  const now = Date.now();

  switch (toStatus) {
    case 'opening':
      return { status: 'opening', startedAt: now };

    case 'selecting-group': {
      const groupId = (event.payload as { groupId: string })?.groupId ?? '';
      return { status: 'selecting-group', groupId, attempt: 1 };
    }

    case 'captioning': {
      const groupId = fromState.status === 'selecting-group' ? fromState.groupId : '';
      return { status: 'captioning', groupId };
    }

    case 'posting': {
      const groupId = fromState.status === 'captioning' ? fromState.groupId : '';
      return { status: 'posting', groupId };
    }

    case 'verifying': {
      const groupId = fromState.status === 'posting' ? fromState.groupId : '';
      return { status: 'verifying', groupId };
    }

    case 'done': {
      const results = (event.payload as { results: GroupResult[] })?.results ?? [];
      return { status: 'done', completedAt: now, results };
    }

    case 'failed': {
      const reason = (event.payload as { reason: FailureReason })?.reason ?? 'unknown';
      const partialResults =
        (event.payload as { partialResults: GroupResult[] })?.partialResults ?? [];
      return { status: 'failed', reason, failedAt: now, partialResults };
    }

    case 'interrupted': {
      const reason =
        (event.payload as { reason: 'sw-restart' | 'browser-close' })?.reason ?? 'sw-restart';
      const checkpoint = (event.payload as { checkpoint: JobCheckpoint })?.checkpoint;
      return { status: 'interrupted', reason, checkpoint: checkpoint! };
    }

    default:
      // For 'queued' -> 'opening' etc. without special payload
      if (toStatus === 'queued') {
        const scheduledAt = fromState.status === 'queued' ? fromState.scheduledAt : now;
        return { status: 'queued', scheduledAt };
      }
      throw new Error(`Unhandled target state: ${toStatus}`);
  }
}

export function canTransition(from: ShareJobState['status'], trigger: StateEvent['type']): boolean {
  if (WILDCARD_TRANSITIONS[trigger]) return true;
  return !!TRANSITIONS[from]?.[trigger];
}

export function getValidTriggers(from: ShareJobState['status']): StateEvent['type'][] {
  const specific = Object.keys(TRANSITIONS[from] ?? {});
  const wildcard = Object.keys(WILDCARD_TRANSITIONS);
  return [...new Set([...specific, ...wildcard])] as StateEvent['type'][];
}

export function isTerminalState(state: ShareJobState): boolean {
  return state.status === 'done' || state.status === 'failed' || state.status === 'interrupted';
}

export function createInitialState(scheduledAt: number): ShareJobState {
  return { status: 'queued', scheduledAt };
}

export function createFailureState(
  reason: FailureReason,
  partialResults: GroupResult[] = []
): ShareJobState {
  return {
    status: 'failed',
    reason,
    failedAt: Date.now(),
    partialResults,
  };
}

export function createInterruptedState(
  reason: 'sw-restart' | 'browser-close',
  checkpoint: JobCheckpoint
): ShareJobState {
  return { status: 'interrupted', reason, checkpoint };
}
