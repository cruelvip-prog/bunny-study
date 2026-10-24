import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import type { DashboardNotification } from '../admin/dashboardContent';

export type NotificationFeedStatus = 'loading' | 'ready' | 'error';

interface NotificationBellProps {
  notifications: readonly DashboardNotification[];
  status: NotificationFeedStatus;
  onClearAll: () => void;
  emptyMessage?: string;
}

function formatNotificationDate(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
}

export function NotificationBell({
  notifications,
  status,
  onClearAll,
  emptyMessage = 'No notifications right now.',
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const notificationCount = notifications.length;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) popupRef.current?.focus();
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={notificationCount > 0
          ? `Notifications, ${notificationCount} item${notificationCount === 1 ? '' : 's'}`
          : 'Notifications'}
        aria-expanded={isOpen}
        aria-controls={popupId}
        aria-haspopup="dialog"
        title="Notifications"
        onClick={() => setIsOpen((open) => !open)}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${isOpen
          ? 'border-blue-300 text-blue-700 ring-2 ring-blue-100'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-700'}`}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {notificationCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black leading-none text-white ring-2 ring-slate-100"
          >
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        )}
      </button>

      <div
        id={popupId}
        ref={popupRef}
        role="dialog"
        aria-label="Notifications"
        aria-hidden={!isOpen}
        hidden={!isOpen}
        tabIndex={-1}
        className="absolute right-[-3.25rem] top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl shadow-slate-900/10 outline-none sm:right-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900">Notifications</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {status === 'ready' && notificationCount > 0
                ? `${notificationCount} update${notificationCount === 1 ? '' : 's'}`
                : 'Updates for your learning space'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {status === 'ready' && (
              <button
                type="button"
                onClick={onClearAll}
                disabled={notificationCount === 0}
                className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {status === 'loading' ? (
          <div className="px-4 py-8 text-center">
            <p role="status" className="text-xs font-semibold text-slate-500">Loading notifications...</p>
          </div>
        ) : status === 'error' ? (
          <div className="px-4 py-8 text-center">
            <p role="alert" className="text-xs leading-5 text-rose-700">
              Notifications could not be loaded. Please refresh the dashboard or try again later.
            </p>
          </div>
        ) : notificationCount > 0 ? (
          <ul className="max-h-[min(20rem,60vh)] space-y-2 overflow-y-auto overscroll-contain p-3">
            {notifications.map((notification) => {
              const createdDate = formatNotificationDate(notification.created_at);
              return (
                <li key={notification.id} className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs font-bold text-slate-800">{notification.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{notification.message}</p>
                  {createdDate && (
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {createdDate}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-2 text-xs font-bold text-slate-700">You're all caught up</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
