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

export type NotifKind = 'assigned' | 'due-today' | 'due-soon' | 'overdue';

/** Display order of the notification sections in the bell dropdown. */
export const NOTIF_SECTION_ORDER: { kind: NotifKind; label: string }[] = [
  { kind: 'overdue', label: '🚨 OVERDUE' },
  { kind: 'due-today', label: '📅 Due Today' },
  { kind: 'due-soon', label: '⏰ Due Tomorrow' },
  { kind: 'assigned', label: '🆕 Assigned to you' },
];

export interface AppNotification {
  id: string; // stable dedupe id: kind:taskId:date
  kind: NotifKind;
  taskId: string;
  title: string; // notification headline
  body: string; // details
  createdAt: number;
}

const DISMISSED_KEY = 'dennis_notif_dismissed_v2'; // ids the user cleared
const READ_KEY = 'dennis_notif_read_v2'; // ids already seen (clicked / marked read)
const PUSHED_KEY = 'dennis_notif_pushed_v2'; // ids already sent as browser push
/** Per-user marker for the OVERDUE login pop-up ("YYYY-MM-DD:<userId>"). */
const OVERDUE_POP_KEY = 'dennis_overdue_popup_v1';
/**
 * Per-task "seen" markers — `task:<taskId>` entries stored inside READ_KEY.
 * Notification ids contain the day they were generated (`kind:taskId|d=YYYY-MM-DD`),
 * so an unread overdue reminder regenerates with a NEW id every day and used to
 * count as "new" again even after being clicked or "Mark all as read".
 * These task-level markers make the read state stick for the whole task, so only
 * genuinely new, never-clicked notifications are ever counted.
 */
const LEGACY_READ_KEY = 'dennis_notif_read_v1';
const LEGACY_CLICKED_KEY = 'dennis_notif_clicked_v1';
const LEGACY_DISMISSED_KEY = 'dennis_notif_dismissed_v1';
const DAY_MS = 86_400_000;

/** Storage key that marks a task's notifications as already seen by the user. */
export function taskSeenKey(taskId: string): string {
  return `task:${taskId}`;
}

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, ids: Set<string>) {
  try {
    // Keep storage small: only remember the last 30 days of dated ids.
    // Undated markers (task:<uuid> "seen" flags) are ALWAYS kept — they are
    // what makes a clicked / read notification stay read forever, even when
    // the same event regenerates with a fresh day-based id tomorrow.
    const cutoff = Date.now() - 30 * DAY_MS;
    const arr = Array.from(ids).filter((id) => {
      if (!id.includes('|t=')) return true; // permanent marker (task-seen etc.)
      const ts = Number(id.split('|t=')[1] ?? 0);
      return !ts || ts >= cutoff;
    });
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Merge previously-stored (v1) read/clicked/dismissed ids so old state sticks. */
function loadReadWithLegacy(): Set<string> {
  const next = loadSet(READ_KEY);
  try {
    loadSet(LEGACY_READ_KEY).forEach((id) => next.add(id));
    loadSet(LEGACY_CLICKED_KEY).forEach((id) => next.add(id));
    // Legacy per-task click markers were stored as raw uuids in CLICKED_KEY.
    loadSet(LEGACY_CLICKED_KEY).forEach((id) => {
      if (!id.includes(':')) next.add(taskSeenKey(id));
    });
    localStorage.removeItem(LEGACY_READ_KEY);
    localStorage.removeItem(LEGACY_CLICKED_KEY);
    localStorage.removeItem(LEGACY_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
  return next;
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
        } else if (dd === 0) {
          // Due TODAY — fires when the effective deadline is today. For a
          // Daily recurring task this happens every day it is scheduled, so
          // "Due tomorrow" (yesterday's warning) correctly rolls over into a
          // fresh "Due Today" notification instead of claiming 1 day left.
          out.push({
            id: pushId('due-today'),
            kind: 'due-today',
            taskId: t.id,
            title: '📅 Due today',
            body: `“${t.title}” is due today (${fmtDue(t.due_date)}). Finish it before end of day.`,
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
    const rank = (n: AppNotification) =>
      n.kind === 'overdue' ? 0 : n.kind === 'due-today' ? 1 : n.kind === 'due-soon' ? 2 : 3;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return b.createdAt - a.createdAt;
  });
}

function fmtDue(due?: string | null): string {
  if (!due) return '(no date)';
  const d = new Date(due);
  return isNaN(d.getTime()) ? due.slice(0, 10) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ══════════════════════════ OVERDUE LOGIN POP-UP ══════════════════════════
 * The OVERDUE notification MODAL (src/components/OverdueModal.tsx) pops up
 * right after login when the staff member has tasks that are past deadline.
 * These helpers decide WHEN it should fire and remember that it already did. */

/** A user's overdue tasks — non-completed, assigned-to-me, deadline passed. */
export function getOverdueTasks(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => {
    if (t.status === 'completed') return false;
    const mine = t.assigned_to === userId || (t.assignees ?? []).includes(userId);
    if (!mine) return false;
    const dd = daysUntilEffectiveDeadline(t);
    return dd !== null && dd < 0;
  });
}

/** Storage value marking the pop-up as handled for `userId` today. */
function overduePopStamp(userId: string): string {
  return `${new Date().toISOString().slice(0, 10)}:${userId}`;
}

/** True when the OVERDUE modal should auto-open for this user today. */
export function shouldPopOverdue(userId: string | null | undefined, overdueCount: number): boolean {
  if (!userId || overdueCount <= 0) return false;
  try {
    return localStorage.getItem(OVERDUE_POP_KEY) !== overduePopStamp(userId);
  } catch {
    return true; // storage unavailable → still show the alert once per mount
  }
}

/** Remember that the OVERDUE modal was shown for this user today. */
export function markOverduePopped(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(OVERDUE_POP_KEY, overduePopStamp(userId));
  } catch {
    /* ignore */
  }
}

/** Format "3 days overdue" style labels used by the modal rows. */
export function overdueDaysLabel(task: Task): string {
  const dd = daysUntilEffectiveDeadline(task);
  if (dd === null) return 'No deadline recorded';
  const n = Math.abs(dd);
  return `${n} day${n === 1 ? '' : 's'} overdue`;
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
  // Read ids are seeded with everything the user previously clicked/marked,
  // so a notification never counts as "new" again after it was seen once.
  const [readIds, setReadIds] = useState<Set<string>>(loadReadWithLegacy);

  const all = useMemo(
    () => (profile ? buildNotifications(tasks, profile.id) : []),
    [tasks, profile],
  );

  const visible = useMemo(() => all.filter((n) => !dismissed.has(n.id)), [all, dismissed]);

  /**
   * A notification counts as NEW only if BOTH conditions hold:
   *   1. its exact id was never marked read/dismissed, AND
   *   2. the underlying task was never seen before (per-task `task:<id>`
   *      marker). The second rule is what fixes the bug where daily overdue /
   *      due-soon reminders regenerated with a fresh day-based id and were
   *      counted as new again even after being clicked or "Mark all as read".
   */
  const isRead = useCallback(
    (id: string, taskId?: string) => readIds.has(id) || (!!taskId && readIds.has(taskSeenKey(taskId))),
    [readIds],
  );

  // Persist read state whenever any known id disappears from the feed (the
  // event ended OR the item was dismissed/cleared). This guarantees that a
  // notification is NEVER counted as "new" again once the user has seen it —
  // clicking it or "Mark all as read" sticks for good.
  useEffect(() => {
    const current = new Set(visible.map((n) => n.id));
    setReadIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      prev.forEach((id) => {
        if (!current.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (!changed) return prev;
      saveSet(READ_KEY, next);
      return next;
    });
  }, [visible]);

  const unreadCount = useMemo(
    () => visible.filter((n) => !isRead(n.id, n.taskId)).length,
    [visible, isRead],
  );

  // Fire browser push notifications for brand-new items.
  useEffect(() => {
    visible.forEach((n) => {
      const pushed = loadSet(PUSHED_KEY);
      if (!pushed.has(n.id)) pushBrowserNotification(n);
    });
  }, [visible]);

  /** Add ids/markers to the read set and persist them. */
  const addRead = useCallback((ids: string[]) => {
    setReadIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      ids.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (!changed) return prev;
      saveSet(READ_KEY, next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const ids: string[] = [];
    visible.forEach((n) => ids.push(n.id, taskSeenKey(n.taskId)));
    addRead(ids);
  }, [visible, addRead]);

  /**
   * Mark a single notification as read (used when the user clicks it).
   * Also stores a per-task marker so the same event can never count as new
   * again tomorrow under a fresh day-based id.
   */
  const markRead = useCallback(
    (id: string, taskId?: string) => {
      addRead(taskId ? [id, taskSeenKey(taskId)] : [id]);
    },
    [addRead],
  );

  const dismiss = useCallback(
    (id: string, taskId?: string) => {
      // A dismissed item also stops counting as new — permanently.
      addRead(taskId ? [id, taskSeenKey(taskId)] : [id]);
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(id);
        saveSet(DISMISSED_KEY, next);
        return next;
      });
    },
    [dismissed, addRead],
  );

  const clearAll = useCallback(() => {
    const ids: string[] = [];
    visible.forEach((n) => ids.push(n.id, taskSeenKey(n.taskId)));
    addRead(ids);
    setDismissed((prev) => {
      const next = new Set(prev);
      visible.forEach((n) => next.add(n.id));
      saveSet(DISMISSED_KEY, next);
      return next;
    });
  }, [visible, addRead]);

  return { notifications: visible, unreadCount, markAllRead, markRead, isRead, dismiss, clearAll };
}
