// ============================================================================
// useAnnouncementPopup — decides WHEN the Announcement / Notification modal
// (src/components/AnnouncementModal.tsx) should be shown.
//
// The modal is used when a pop-up specifically delivers an ALERT, a NEWS UPDATE
// or an INVITATION TO READ A NEW ANNOUNCEMENT. This hook keeps track of which
// announcements the current visitor/user has already read (localStorage, so it
// works for logged-out public visitors as well as signed-in staff) and exposes:
//   • unreadIds  → ids never opened before (drives the "N new" chip + dots)
//   • pending    → the notices worth popping up right now
//   • show()     → open the centred modal with those notices
//   • markSeen() → remember that a notice was read (fires from the modal's
//                  onView callback, so viewing = reading)
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Announcement } from './useAnnouncements';

/** Storage key prefix — per-user (or "public" when signed out). */
const SEEN_PREFIX = 'dennis_ann_seen_v1';

function storageKey(userId?: string | null): string {
  return `${SEEN_PREFIX}:${userId ?? 'public'}`;
}

function loadSeen(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(key: string, ids: Set<string>) {
  try {
    // Keep the last 400 markers so storage stays tiny on free hosting.
    const arr = Array.from(ids).slice(-400);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* storage unavailable (private mode) — degrade silently */
  }
}

export interface AnnouncementPopup {
  /** Announcements the visitor has NOT opened yet. */
  unreadIds: string[];
  /** Notices queued for the pop-up (latest first, capped at 8). */
  pending: Announcement[];
  /** Whether the modal is currently on screen. */
  open: boolean;
  /** Open the centred, scrollable modal. Pass a specific announcement to show only it. */
  show: (only?: Announcement | null) => void;
  /** Close the modal (marks everything shown as read). */
  hide: () => void;
  /** Mark one announcement as read (called by the modal while it is viewed). */
  markSeen: (id: string) => void;
  /** Mark every current announcement as read without showing the modal. */
  markAllSeen: () => void;
  /** True once the visitor dismissed the auto pop-up for this session. */
  suppressed: boolean;
}

/**
 * @param announcements live announcements (from useAnnouncements)
 * @param userId        profile id, or null/undefined for public visitors
 * @param options       auto = pop up automatically once per session for new notices
 */
export function useAnnouncementPopup(
  announcements: Announcement[],
  userId?: string | null,
  options: { auto?: boolean; maxPending?: number } = {},
): AnnouncementPopup {
  const { auto = true, maxPending = 8 } = options;
  const key = storageKey(userId);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen(key));
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<Announcement | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const autoFired = useRef(false);

  // Re-read markers if the signed-in user changes (switch accounts).
  useEffect(() => {
    setSeen(loadSeen(key));
    autoFired.current = false;
    setSuppressed(false);
  }, [key]);

  const visible = useMemo(
    () => announcements.filter((a) => a.is_visible !== false),
    [announcements],
  );

  const unreadIds = useMemo(
    () => visible.filter((a) => !seen.has(a.id)).map((a) => a.id),
    [visible, seen],
  );

  const pending = useMemo(() => {
    if (pinned) return [pinned];
    return visible.filter((a) => !seen.has(a.id)).slice(0, maxPending);
  }, [pinned, visible, seen, maxPending]);

  const markSeen = useCallback(
    (id: string) => {
      setSeen((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveSeen(key, next);
        return next;
      });
    },
    [key],
  );

  const markAllSeen = useCallback(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      visible.forEach((a) => next.add(a.id));
      saveSeen(key, next);
      return next;
    });
  }, [visible, key]);

  const show = useCallback((only?: Announcement | null) => {
    setPinned(only ?? null);
    setOpen(true);
    setSuppressed(false);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    setPinned(null);
  }, []);

  // ── AUTO POP-UP ──────────────────────────────────────────────────────────
  // Fires ONCE per visit/session, and only when there are genuinely new,
  // never-read notices — so returning visitors are never nagged again.
  useEffect(() => {
    if (!auto || autoFired.current || suppressed) return;
    if (pending.length === 0) return;
    autoFired.current = true;
    const t = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(t);
  }, [auto, suppressed, pending]);

  // Once the modal is closed, remember we handled this batch for the session.
  useEffect(() => {
    if (!open && pending.length > 0) setSuppressed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { unreadIds, pending, open, show, hide, markSeen, markAllSeen, suppressed };
}
