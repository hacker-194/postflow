/**
 * Background Scheduler
 * Alarm-based scheduling for share jobs with overnight pause and daily limits
 */

import { logger } from '../shared/logger';
import type { ScheduledShare, ShareSettings } from '../shared/types';
import { getAll, get, set } from '../shared/storage';
import { calculateDelay } from './utils';
import { executeShareJob } from './job-runner';

const ALARM_NAME = 'fgp-scheduler';
const ALARM_PERIOD_MINUTES = 1;

export async function setupAlarms(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  logger.info('background', 'Scheduler alarm created', { periodMinutes: ALARM_PERIOD_MINUTES });
}

export async function processScheduledShares(): Promise<void> {
  const now = Date.now();
  const scheduled = await getAll<ScheduledShare>('scheduledShares');
  const pending = Object.values(scheduled).filter(
    s => s.status === 'pending' && s.scheduledAt <= now
  );

  if (pending.length === 0) return;

  logger.info('background', 'Processing scheduled shares', { count: pending.length });

  for (const share of pending) {
    try {
      await executeShareJob(share.id);
    } catch (error) {
      logger.error('background', 'Share job failed', { shareId: share.id, error });
    }
  }
}

export async function scheduleShareJob(share: ScheduledShare): Promise<void> {
  await set('scheduledShares', share, share.id);

  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    await setupAlarms();
  }

  logger.info('background', 'Share job scheduled', {
    shareId: share.id,
    scheduledAt: share.scheduledAt,
  });
}

export async function cancelShareJob(shareId: string): Promise<boolean> {
  const share = await get<ScheduledShare>('scheduledShares', shareId);
  if (share && share.status === 'pending') {
    await set('scheduledShares', { ...share, status: 'cancelled' }, shareId);
    logger.info('background', 'Share job cancelled', { shareId });
    return true;
  }
  return false;
}

export async function getNextRunTime(): Promise<number | null> {
  const scheduled = await getAll<ScheduledShare>('scheduledShares');
  const pending = Object.values(scheduled).filter(s => s.status === 'pending');
  if (pending.length === 0) return null;

  return Math.min(...pending.map(s => s.scheduledAt));
}

export function isWithinOvernightPause(settings: ShareSettings): boolean {
  if (!settings.overnightPause || !settings.overnightStart || !settings.overnightEnd) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parseTime = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const startMinutes = parseTime(settings.overnightStart);
  const endMinutes = parseTime(settings.overnightEnd);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

export function getOvernightPauseEndTime(settings: ShareSettings): Date | null {
  if (!settings.overnightEnd) return null;

  const [hours, minutes] = settings.overnightEnd.split(':').map(Number);
  const endTime = new Date();
  endTime.setHours(hours, minutes, 0, 0);

  if (endTime <= new Date()) {
    endTime.setDate(endTime.getDate() + 1);
  }

  return endTime;
}

export function calculateNextDelay(settings: ShareSettings, isLastGroup: boolean): number {
  if (isLastGroup) return 0;
  return calculateDelay(settings);
}
