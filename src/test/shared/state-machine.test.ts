import { describe, it, expect } from 'vitest';
import {
  transition,
  canTransition,
  getValidTriggers,
  isTerminalState,
  createFailureState,
  createInterruptedState,
  createInitialState,
} from '../../shared/state-machine';
import type {
  ShareJobState,
  StateEvent,
  FailureReason,
  GroupResult,
  JobCheckpoint,
} from '../../shared/types';

describe('state-machine', () => {
  describe('transition', () => {
    it('transitions from queued to opening on alarm-tick', () => {
      const state: ShareJobState = { status: 'queued', scheduledAt: Date.now() };
      const event: StateEvent = { type: 'alarm-tick' };
      const result = transition(state, event);
      expect(result.status).toBe('opening');
    });

    it('transitions from opening to selecting-group on share-dialog-opened', () => {
      const state: ShareJobState = { status: 'opening', startedAt: Date.now() };
      const event: StateEvent = { type: 'share-dialog-opened', payload: { groupId: 'group1' } };
      const result = transition(state, event);
      expect(result.status).toBe('selecting-group');
      expect(result.status === 'selecting-group' && result.groupId).toBe('group1');
    });

    it('transitions from selecting-group to captioning on group-selected', () => {
      const state: ShareJobState = { status: 'selecting-group', groupId: 'group1', attempt: 1 };
      const event: StateEvent = { type: 'group-selected', payload: { groupId: 'group1' } };
      const result = transition(state, event);
      expect(result.status).toBe('captioning');
    });

    it('transitions from captioning to posting on caption-set', () => {
      const state: ShareJobState = { status: 'captioning', groupId: 'group1' };
      const event: StateEvent = { type: 'caption-set' };
      const result = transition(state, event);
      expect(result.status).toBe('posting');
    });

    it('transitions from posting to verifying on post-clicked', () => {
      const state: ShareJobState = { status: 'posting', groupId: 'group1' };
      const event: StateEvent = { type: 'post-clicked' };
      const result = transition(state, event);
      expect(result.status).toBe('verifying');
    });

    it('transitions from verifying to selecting-group on success (more groups)', () => {
      const state: ShareJobState = { status: 'verifying', groupId: 'group1' };
      const event: StateEvent = { type: 'success', payload: { groupId: 'group2' } };
      const result = transition(state, event);
      expect(result.status).toBe('selecting-group');
      expect(result.status === 'selecting-group' && result.groupId).toBe('group2');
    });

    it('transitions from verifying to done on all-groups-done', () => {
      const state: ShareJobState = { status: 'verifying', groupId: 'group1' };
      const results: GroupResult[] = [
        { groupId: 'group1', groupName: 'Group 1', success: true, timestamp: Date.now() },
      ];
      const event: StateEvent = { type: 'all-groups-done', payload: { results } };
      const result = transition(state, event);
      expect(result.status).toBe('done');
      expect(result.status === 'done' && result.results).toEqual(results);
    });

    it('transitions from any state to failed on anomaly-detected', () => {
      const state: ShareJobState = { status: 'posting', groupId: 'group1' };
      const event: StateEvent = {
        type: 'anomaly-detected',
        payload: { reason: 'captcha' as FailureReason },
      };
      const result = transition(state, event);
      expect(result.status).toBe('failed');
      expect(result.status === 'failed' && result.reason).toBe('captcha');
    });

    it('transitions from any state to interrupted on sw-restart', () => {
      const state: ShareJobState = { status: 'posting', groupId: 'group1' };
      const checkpoint: JobCheckpoint = {
        shareId: 'share1',
        jobState: state,
        completedGroups: [],
        currentGroupIndex: 0,
        updatedAt: Date.now(),
      };
      const event: StateEvent = { type: 'sw-restart', payload: { checkpoint } };
      const result = transition(state, event);
      expect(result.status).toBe('interrupted');
      expect(result.status === 'interrupted' && result.checkpoint).toEqual(checkpoint);
    });
  });

  describe('canTransition', () => {
    it('returns true for valid transitions', () => {
      expect(canTransition('queued', 'alarm-tick')).toBe(true);
      expect(canTransition('opening', 'share-dialog-opened')).toBe(true);
      expect(canTransition('selecting-group', 'group-selected')).toBe(true);
      expect(canTransition('captioning', 'caption-set')).toBe(true);
      expect(canTransition('posting', 'post-clicked')).toBe(true);
      expect(canTransition('verifying', 'success')).toBe(true);
      expect(canTransition('verifying', 'all-groups-done')).toBe(true);
    });

    it('returns true for wildcard transitions', () => {
      expect(canTransition('queued', 'sw-restart')).toBe(true);
      expect(canTransition('posting', 'sw-restart')).toBe(true);
      expect(canTransition('done', 'sw-restart')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(canTransition('queued', 'share-dialog-opened')).toBe(false);
      expect(canTransition('posting', 'alarm-tick')).toBe(false);
      expect(canTransition('done', 'alarm-tick')).toBe(false);
    });
  });

  describe('getValidTriggers', () => {
    it('returns valid triggers for each state', () => {
      expect(getValidTriggers('queued')).toContain('alarm-tick');
      expect(getValidTriggers('opening')).toContain('share-dialog-opened');
      expect(getValidTriggers('verifying')).toContain('success');
      expect(getValidTriggers('verifying')).toContain('all-groups-done');
    });

    it('includes wildcard triggers', () => {
      expect(getValidTriggers('queued')).toContain('sw-restart');
      expect(getValidTriggers('done')).toContain('sw-restart');
    });
  });

  describe('isTerminalState', () => {
    it('returns true for terminal states', () => {
      expect(isTerminalState({ status: 'done', completedAt: Date.now(), results: [] })).toBe(true);
      expect(
        isTerminalState({
          status: 'failed',
          reason: 'captcha',
          failedAt: Date.now(),
          partialResults: [],
        })
      ).toBe(true);
      expect(
        isTerminalState({
          status: 'interrupted',
          reason: 'sw-restart',
          checkpoint: {} as JobCheckpoint,
        })
      ).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(isTerminalState({ status: 'queued', scheduledAt: Date.now() })).toBe(false);
      expect(isTerminalState({ status: 'opening', startedAt: Date.now() })).toBe(false);
      expect(isTerminalState({ status: 'posting', groupId: 'group1' })).toBe(false);
    });
  });

  describe('createFailureState', () => {
    it('creates failed state with reason', () => {
      const reason: FailureReason = 'captcha';
      const partialResults: GroupResult[] = [];
      const result = createFailureState(reason, partialResults);
      expect(result.status).toBe('failed');
      expect(result.reason).toBe('captcha');
      expect(result.partialResults).toEqual([]);
    });
  });

  describe('createInterruptedState', () => {
    it('creates interrupted state with checkpoint', () => {
      const checkpoint: JobCheckpoint = {
        shareId: 'share1',
        jobState: { status: 'queued', scheduledAt: Date.now() },
        completedGroups: [],
        currentGroupIndex: 2,
        updatedAt: Date.now(),
      };
      const result = createInterruptedState('sw-restart', checkpoint);
      expect(result.status).toBe('interrupted');
      expect(result.reason).toBe('sw-restart');
      expect(result.checkpoint).toEqual(checkpoint);
    });
  });

  describe('createInitialState', () => {
    it('creates queued state with scheduledAt', () => {
      const scheduledAt = Date.now();
      const result = createInitialState(scheduledAt);
      expect(result.status).toBe('queued');
      expect(result.scheduledAt).toBe(scheduledAt);
    });
  });
});
