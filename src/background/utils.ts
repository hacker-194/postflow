/**
 * Background Utilities
 * Shared utility functions for background scripts
 */

import type { ShareSettings } from '../shared/types';
import { SAFETY_LEVEL_DELAYS } from '../shared/constants';

export function calculateDelay(settings: ShareSettings): number {
  const baseDelay = settings.delayBetweenGroups || 60000;
  const safetyLevel = settings.safetyLevel || 'safe';
  const range = SAFETY_LEVEL_DELAYS[safetyLevel] || SAFETY_LEVEL_DELAYS.safe;
  const jitter = Math.random() * (range.max - range.min) + range.min;
  return baseDelay + jitter;
}

export function isOvernightPause(settings: ShareSettings): boolean {
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

export async function waitForOvernightPauseEnd(settings: ShareSettings): Promise<void> {
  if (!settings.overnightEnd) return;

  const [hours, minutes] = settings.overnightEnd.split(':').map(Number);
  const endTime = new Date();
  endTime.setHours(hours, minutes, 0, 0);

  if (endTime <= new Date()) {
    endTime.setDate(endTime.getDate() + 1);
  }

  const waitMs = endTime.getTime() - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseTimeStr(timeStr: string): number | null {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function generateShareId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomPart = Array.from(array, byte => chars[byte % chars.length]).join('');
  return `shr_${Date.now().toString(36)}_${randomPart}`;
}
