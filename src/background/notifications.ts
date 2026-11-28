/**
 * Notifications
 * Desktop notifications and sound alerts
 */

import { logger } from '../shared/logger';
import { getUserSettings } from '../shared/storage';

export async function notifyUser(
  shareId: string,
  status: 'completed' | 'failed' | 'progress',
  totalGroups: number,
  message?: string
): Promise<void> {
  const userSettings = await getUserSettings();

  if (userSettings.desktopNotifications) {
    await showDesktopNotification(shareId, status, totalGroups, message);
  }

  if (userSettings.soundNotifications) {
    playSound(status);
  }
}

async function showDesktopNotification(
  shareId: string,
  status: 'completed' | 'failed' | 'progress',
  totalGroups: number,
  customMessage?: string
): Promise<void> {
  let title = '';
  let notificationMessage = '';

  switch (status) {
    case 'completed':
      title = 'Share Completed';
      notificationMessage = customMessage || `Successfully shared to ${totalGroups} groups`;
      break;
    case 'failed':
      title = 'Share Failed';
      notificationMessage = customMessage || `Failed to share. Check extension for details.`;
      break;
    case 'progress':
      title = 'Sharing in Progress';
      notificationMessage = customMessage || `Sharing to groups...`;
      break;
  }

  try {
    await chrome.notifications.create(`fgp-${shareId}-${status}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message: notificationMessage,
      priority: status === 'failed' ? 2 : 1,
      requireInteraction: status === 'failed',
    });
  } catch (error) {
    logger.warn('background', 'Failed to create notification', { error });
  }
}

function playSound(status: 'completed' | 'failed' | 'progress'): void {
  try {
    // Use Web Audio API for simple tones
    const audioContext = new (
      window.AudioContext ||
      (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (status === 'completed') {
      // Success: ascending tone
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } else if (status === 'failed') {
      // Failure: descending tone
      oscillator.frequency.setValueAtTime(392.0, audioContext.currentTime); // G4
      oscillator.frequency.setValueAtTime(329.63, audioContext.currentTime + 0.15); // E4
      oscillator.frequency.setValueAtTime(261.63, audioContext.currentTime + 0.3); // C4
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.6);
    }
  } catch {
    // Audio not available, silently ignore
  }
}
