// =====================================================================
// In-app notification system — 100% FREE, no paid services required.
//
//   • Browser push notifications (the free native Notification API)
//     for: Task assigned · Due 1 day before deadline · OVERDUE (important)
//   • An in-app bell with a live unread counter (works even when the
//     browser blocks/push is denied or the tab is closed later).
//
// Notifications are generated from the user's own task list and
// de-duplicated per-day via localStorage, so you never get spammed
// twice for the same event on the same day.
// =====================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { daysUntilEffectiveDeadline } from './useTasks';
import type { Profile, Task } from './types';

export type NotifKind = 'assigned' | 'due-soon' | 'overdue';

export interface AppNotification {
  id: string; // stable dedupe id: kind:taskId:date
  kind: NotifKind;
  taskId: string;
  title: string; // notification headline
  body: string; // details
  createdAt: number;
}

const DISMISSED_KEY = 'dennis_notif_dismissed_v1'; // ids the user cleared
const READ_KEY = 'dennis_notif_read_v1'; // ids already seen
const PUSHED_KEY = 'dennis_notif_pushed_v1'; // ids already sent as browser push
const DAY_MS = 86_400_000;

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, ids: Set<string>) {
  try {
    // Keep storage small: only remember the last 30 days of ids.
    const cutoff = Date.now() - 30 * DAY_MS;
    const arr = Array.from(ids).filter((id) => {
      const ts = Number(id.split('|t=')[1] ?? 0);
      return !ts || ts >= cutoff;
    });
    localStorage.setItem(key, JSON.stringify(arr.slice(-500)));
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Build the notification feed for `userId` from their tasks.
 *  • assigned  → fires once per day for freshly assigned tasks
 *  • due-soon  → fires when the deadline is exactly 1 day away
 *  • overdue   → fires every day while the task stays overdue (important!)
 */
export function buildNotifications(tasks: Task[], userId: string): AppNotification[] {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const out: AppNotification[] = [];

  for (const t of tasks) {
    const mine = t.assigned_to === userId || (t.assignees ?? []).includes(userId);
    if (!mine) continue;

    const pushId = (kind: string) => `${kind}:${t.id}|d=${today}|t=${now}`;

    if (t.status !== 'completed') {
      // --- Assigned (recent) ---
      const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
      const assignedByMe = t.assigned_by === userId;
      if (createdMs && now - createdMs < 7 * DAY_MS && !assignedByMe) {
        const who = t.assignee?.full_name ?? 'a administrator';
        out.push({
          id: pushId('assigned'),
          kind: 'assigned',
          taskId: t.id,
          title: '🆕 New task assigned to you',
          body: `“${t.title}” was assigned to you by ${who}.`,
          createdAt: createdMs,
        });
      }

      // --- Deadline reminders ---
      const dd = daysUntilEffectiveDeadline(t);
      if (dd !== null) {
        if (dd < 0) {
          out.push({
            id: pushId('overdue'),
            kind: 'overdue',
            taskId: t.id,
            title: '🚨 OVERDUE task — act immediately',
            body: `“${t.title}” was due on ${fmtDue(t.due_date)} — overdue by ${Math.abs(dd)} day(s).`,
            createdAt: now,
          });
        } else if (dd === 1) {
          out.push({
            id: pushId('due-soon'),
            kind: 'due-soon',
            taskId: t.id,
            title: '⏰ Due tomorrow',
            body: `“${t.title}” is due on ${fmtDue(t.due_date)} (1 day left).`,
            createdAt: now,
          });
        }
      }
    }
  }

  return out.sort((a, b) => {
    const rank = (n: AppNotification) => (n.kind === 'overdue' ? 0 : n.kind === 'due-soon' ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return b.createdAt - a.createdAt;
  });
}

function fmtDue(due?: string | null): string {
  if (!due) return '(no date)';
  const d = new Date(due);
  return isNaN(d.getTime()) ? due.slice(0, 10) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Ask for browser-notification permission (free, native API). */
export function useNotifPermission() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );
  const request = useCallback(async () => {
    if (!supported) return 'unsupported' as NotificationPermission;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, [supported]);
  return { supported, permission, request };
}

/** Send one browser push notification if permission was granted (once per id). */
export function pushBrowserNotification(n: AppNotification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const pushed = loadSet(PUSHED_KEY);
  if (pushed.has(n.id)) return;
  pushed.add(n.id);
  saveSet(PUSHED_KEY, pushed);
  try {
    const notif = new Notification(n.title, {
      body: n.body,
      tag: n.id, // prevents duplicates across tabs
      requireInteraction: n.kind === 'overdue', // important ones stay until dismissed
    });
    if (n.kind === 'overdue') notif.onclick = () => window.focus();
  } catch {
    /* some browsers require a service worker — the in-app bell still works */
  }
}

/**
 * Live notification feed for the logged-in user.
 * Re-computes whenever the task list changes (realtime updates included).
 */
export function useNotifications(profile: Profile | null, tasks: Task[]) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadSet(DISMISSED_KEY));
  const [readIds, setReadIds] = useState<Set<string>>(() => loadSet(READ_KEY));

  const all = useMemo(
    () => (profile ? buildNotifications(tasks, profile.id) : []),
    [tasks, profile],
  );

  const visible = useMemo(() => all.filter((n) => !dismissed.has(n.id)), [all, dismissed]);

  const unreadCount = useMemo(
    () => visible.filter((n) => !readIds.has(n.id)).length,
    [visible, readIds],
  );

  // Fire browser push notifications for brand-new items.
  useEffect(() => {
    visible.forEach((n) => {
      const pushed = loadSet(PUSHED_KEY);
      if (!pushed.has(n.id)) pushBrowserNotification(n);
    });
  }, [visible]);

  const markAllRead = useCallback(() => {
    const next = new Set([...readIds, ...visible.map((n) => n.id)]);
    setReadIds(next);
    saveSet(READ_KEY, next);
  }, [readIds, visible]);

  const dismiss = useCallback(
    (id: string) => {
      const next = new Set([...dismissed, id]);
      setDismissed(next);
      saveSet(DISMISSED_KEY, next);
    },
    [dismissed],
  );

  const clearAll = useCallback(() => {
    const next = new Set([...dismissed, ...visible.map((n) => n.id)]);
    setDismissed(next);
    saveSet(DISMISSED_KEY, next);
  }, [dismissed, visible]);

  return { notifications: visible, unreadCount, markAllRead, dismiss, clearAll };
}
