import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationBell } from '../src/components/NotificationBell';
import {
  filterVisibleNotifications,
  getNotificationDismissalKey,
  mergeDismissedNotificationKeys,
} from '../src/utils/notificationFeed';
import type { DashboardNotification } from '../src/admin/dashboardContent';

function notification(
  id: string,
  updatedAt = '2026-10-24T08:00:00.000Z',
): DashboardNotification {
  return {
    id,
    title: `Title ${id}`,
    message: `Message ${id}`,
    sort_order: 10,
    is_active: true,
    created_at: '2026-10-23T08:00:00.000Z',
    updated_at: updatedAt,
  };
}

test('notification dismissal hides only the cleared version of each notification', () => {
  const first = notification('first');
  const second = notification('second');
  const dismissed = [getNotificationDismissalKey(first)];

  assert.deepEqual(
    filterVisibleNotifications([first, second], dismissed).map((item) => item.id),
    ['second'],
  );

  const editedFirst = notification('first', '2026-10-24T09:00:00.000Z');
  assert.deepEqual(
    filterVisibleNotifications([editedFirst, second], dismissed).map((item) => item.id),
    ['first', 'second'],
  );
});

test('Clear all adds every visible notification once and preserves earlier dismissals', () => {
  const first = notification('first');
  const second = notification('second');
  const earlier = notification('earlier');
  const next = mergeDismissedNotificationKeys(
    [getNotificationDismissalKey(earlier)],
    [first, second, first],
  );

  assert.equal(new Set(next).size, next.length);
  assert.deepEqual(next, [
    getNotificationDismissalKey(earlier),
    getNotificationDismissalKey(first),
    getNotificationDismissalKey(second),
  ]);
  assert.deepEqual(filterVisibleNotifications([earlier, first, second], next), []);
});

test('notification bell exposes an anchored popup, count badge, empty state, and Clear all', () => {
  const markup = renderToStaticMarkup(React.createElement(NotificationBell, {
    notifications: [notification('first')],
    status: 'ready',
    onClearAll: () => {},
  }));

  assert.match(markup, /aria-label="Notifications, 1 item"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="[^"]+"/);
  assert.match(markup, /Title first/);
  assert.match(markup, /Message first/);
  assert.match(markup, />Clear all</);

  const emptyMarkup = renderToStaticMarkup(React.createElement(NotificationBell, {
    notifications: [],
    status: 'ready',
    onClearAll: () => {},
    emptyMessage: 'No notifications are configured yet.',
  }));

  assert.match(emptyMarkup, /all caught up/);
  assert.match(emptyMarkup, /No notifications are configured yet\./);
  assert.match(emptyMarkup, />Clear all</);
});
