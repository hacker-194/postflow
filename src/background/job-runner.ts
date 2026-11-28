/**
 * Job Runner
 * Executes a single share job using the state machine with checkpointing
 */

import { logger } from '../shared/logger';
import type {
  ScheduledShare,
  ShareProgress,
  GroupResult,
  Group,
  JobCheckpoint,
  ShareJobState,
  FailureReason,
} from '../shared/types';
import {
  get,
  set,
  getAll,
  getGroups,
  getGroupsForList,
  setJobCheckpoint,
  deleteJobCheckpoint,
  incrementDailyPosts,
} from '../shared/storage';
import { transition, createInitialState } from '../shared/state-machine';
import { calculateDelay, isOvernightPause, sleep, waitForOvernightPauseEnd } from './utils';
import { performShareInContentScript } from './share-executor';
import { notifyUser } from './notifications';

export async function executeShareJob(shareId: string): Promise<void> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (!share || share.status !== 'pending') return;

  // Initialize job state and start it: the state machine only leaves `queued` on an alarm tick.
  let jobState: ShareJobState = createInitialState(share.scheduledAt);
  jobState = transition(jobState, { type: 'alarm-tick' });
  // The share sheet sends the exact groups it was told to share; only fall back to
  // a saved list when no explicit selection was sent.
  let groups = await getGroupsForList(share.groupListId);
  if (share.groupIds?.length) {
    const allGroups = await getGroups();
    groups = share.groupIds
      .map(id => allGroups[id])
      .filter((group): group is Group => Boolean(group));
  }
  const settings = share.settings;

  // Update status to running
  await set(
    'scheduledShares',
    { ...share, status: 'running', progress: createInitialProgress(groups.length) },
    shareId
  );

  let dailyPosts = (await get<number>('dailyPosts')) || 0;
  const maxPerDay = settings.maxPostsPerDay || 20;

  const completedGroups: GroupResult[] = [];
  const errors: ShareProgress['errors'] = [];

  try {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;

      // Check daily limit
      if (dailyPosts >= maxPerDay) {
        errors.push({
          groupId: group.id,
          groupName: group.name,
          error: 'Daily post limit reached',
          timestamp: Date.now(),
          retryable: false,
        });
        jobState = transition(jobState, {
          type: 'anomaly-detected',
          payload: { reason: 'daily-limit-reached' },
        });
        break;
      }

      // Check overnight pause
      if (await isOvernightPause(settings)) {
        await waitForOvernightPauseEnd(settings);
      }

      // Update progress - selecting group
      jobState = transition(jobState, {
        type: 'share-dialog-opened',
        payload: { groupId: group.id },
      });
      await updateProgress(shareId, { currentGroupId: group.id, currentGroupName: group.name });

      // Execute share for this group
      try {
        const result = await performShareInContentScript(
          share.postUrl,
          group.id,
          group.name,
          settings
        );

        if (result.success) {
          dailyPosts++;
          await incrementDailyPosts(1);
          completedGroups.push({
            groupId: group.id,
            groupName: group.name,
            success: true,
            timestamp: Date.now(),
          });
          jobState = transition(jobState, {
            type: 'success',
            payload: { nextGroup: groups[i + 1]?.id },
          });
        } else {
          completedGroups.push({
            groupId: group.id,
            groupName: group.name,
            success: false,
            error: result.error,
            timestamp: Date.now(),
          });
          errors.push({
            groupId: group.id,
            groupName: group.name,
            error: result.error || 'Unknown error',
            timestamp: Date.now(),
            retryable: !result.anomaly || result.anomaly.recoverable,
          });

          // Check for anomaly
          if (result.anomaly && !result.anomaly.recoverable) {
            jobState = transition(jobState, {
              type: 'anomaly-detected',
              payload: { reason: result.anomaly.type as FailureReason },
            });
            break;
          } else {
            jobState = transition(jobState, {
              type: 'success',
              payload: { nextGroup: groups[i + 1]?.id },
            });
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        completedGroups.push({
          groupId: group.id,
          groupName: group.name,
          success: false,
          error: errorMsg,
          timestamp: Date.now(),
        });
        errors.push({
          groupId: group.id,
          groupName: group.name,
          error: errorMsg,
          timestamp: Date.now(),
          retryable: true,
        });
        jobState = transition(jobState, {
          type: 'success',
          payload: { nextGroup: groups[i + 1]?.id },
        });
      }

      // Checkpoint after each group
      await checkpoint(shareId, jobState, completedGroups, i + 1);

      // Update progress
      await updateProgress(shareId, {
        completedGroups: i + 1,
        successfulGroups: completedGroups.filter(g => g.success).length,
        failedGroups: completedGroups.filter(g => !g.success).length,
        errors,
      });

      // Delay before next group (unless last)
      if (i < groups.length - 1) {
        const delay = calculateDelay(settings);
        await sleep(delay);
      }
    }

    // Job completed
    await set(
      'scheduledShares',
      {
        ...share,
        status: 'completed',
        completedAt: Date.now(),
        progress: {
          totalGroups: groups.length,
          completedGroups: groups.length,
          successfulGroups: completedGroups.filter(g => g.success).length,
          failedGroups: completedGroups.filter(g => !g.success).length,
          errors,
          startedAt: Date.now(),
        },
      },
      shareId
    );

    await deleteJobCheckpoint(shareId);
    await notifyUser(shareId, 'completed', groups.length);
  } catch (error) {
    // Job failed unexpectedly
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('background', 'Job execution failed', { shareId, error: errorMsg });

    await set(
      'scheduledShares',
      {
        ...share,
        status: 'failed',
        progress: {
          totalGroups: groups.length,
          completedGroups: completedGroups.length,
          successfulGroups: completedGroups.filter(g => g.success).length,
          failedGroups: completedGroups.filter(g => !g.success).length,
          errors: [
            ...errors,
            {
              groupId: '',
              groupName: '',
              error: errorMsg,
              timestamp: Date.now(),
              retryable: false,
            },
          ],
          startedAt: Date.now(),
        },
      },
      shareId
    );

    await notifyUser(shareId, 'failed', groups.length);
  }
}

function createInitialProgress(totalGroups: number): ShareProgress {
  return {
    totalGroups,
    completedGroups: 0,
    successfulGroups: 0,
    failedGroups: 0,
    errors: [],
    startedAt: Date.now(),
  };
}

async function updateProgress(shareId: string, updates: Partial<ShareProgress>): Promise<void> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (share && share.progress) {
    const newProgress: ShareProgress = { ...share.progress, ...updates };
    await set('scheduledShares', { ...share, progress: newProgress }, shareId);
    broadcastProgress(shareId, newProgress);
  }
}

function broadcastProgress(shareId: string, progress: ShareProgress): void {
  chrome.runtime.sendMessage({ type: 'SHARE_PROGRESS', shareId, progress });
}

async function checkpoint(
  shareId: string,
  jobState: ShareJobState,
  completedGroups: GroupResult[],
  currentGroupIndex: number
): Promise<void> {
  const checkpoint: JobCheckpoint = {
    shareId,
    jobState,
    completedGroups,
    currentGroupIndex,
    updatedAt: Date.now(),
  };
  await setJobCheckpoint(checkpoint);
}

export async function recoverJobs(): Promise<void> {
  const checkpoints = await getAll<JobCheckpoint>('jobCheckpoints');
  for (const cp of Object.values(checkpoints)) {
    const share = await get<ScheduledShare>('scheduledShares', cp.shareId);
    if (!share) continue;

    if (cp.jobState.status === 'queued' || cp.jobState.status === 'selecting-group') {
      // Resume from next group
      logger.info('background', 'Resuming job from checkpoint', { shareId: cp.shareId });
      await set(
        'scheduledShares',
        { ...share, status: 'pending', scheduledAt: Date.now() },
        cp.shareId
      );
    } else if (cp.jobState.status === 'opening' || cp.jobState.status === 'captioning') {
      // Mark interrupted - user must retry
      logger.info('background', 'Marking job as interrupted', { shareId: cp.shareId });
      await set('scheduledShares', { ...share, status: 'interrupted', checkpoint: cp }, cp.shareId);
    }
  }
}
