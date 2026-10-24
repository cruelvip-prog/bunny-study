import type { DashboardNotification } from '../admin/dashboardContent';
import {
  getAccountLocalStorageKey,
  getActiveAccountOwnerId,
} from './accountStorage';

export const DISMISSED_NOTIFICATION_STORAGE_KEY = 'oinkie_prep_dismissed_notifications_v1';
const MAX_DISMISSED_NOTIFICATION_KEYS = 250;

/**
 * A notification can be dismissed again only after it is edited. New and
 * updated admin notifications therefore remain visible after "Clear all".
 */
export function getNotificationDismissalKey(notification: DashboardNotification): string {
  return `${notification.id}:${notification.updated_at || notification.created_at || ''}`;
}

export function filterVisibleNotifications(
  notifications: readonly DashboardNotification[],
  dismissedKeys: readonly string[],
): DashboardNotification[] {
  if (!dismissedKeys.length) return [...notifications];
  const dismissed = new Set(dismissedKeys);
  return notifications.filter(
    (notification) => !dismissed.has(getNotificationDismissalKey(notification)),
  );
}

export function mergeDismissedNotificationKeys(
  currentKeys: readonly string[],
  notifications: readonly DashboardNotification[],
): string[] {
  return [...new Set([
    ...currentKeys,
    ...notifications.map(getNotificationDismissalKey),
  ])].filter((key) => key.trim().length > 0).slice(-MAX_DISMISSED_NOTIFICATION_KEYS);
}

function dismissedNotificationStorageKey(): string {
  const ownerId = getActiveAccountOwnerId();
  return ownerId
    ? getAccountLocalStorageKey(ownerId, DISMISSED_NOTIFICATION_STORAGE_KEY)
    : DISMISSED_NOTIFICATION_STORAGE_KEY;
}

export function readDismissedNotificationKeys(): string[] {
  try {
    const saved = localStorage.getItem(dismissedNotificationStorageKey());
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .slice(-MAX_DISMISSED_NOTIFICATION_KEYS);
  } catch {
    return [];
  }
}

export function saveDismissedNotificationKeys(keys: readonly string[]): void {
  try {
    const uniqueKeys = [...new Set(keys.filter((key) => key.trim().length > 0))]
      .slice(-MAX_DISMISSED_NOTIFICATION_KEYS);
    localStorage.setItem(dismissedNotificationStorageKey(), JSON.stringify(uniqueKeys));
  } catch {
    // Dismissals remain active in memory for the current session.
  }
}
