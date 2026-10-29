import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useRealtimeTableChanges } from './realtime';
import type { Profile } from './types';

/**
 * ANNOUNCEMENTS — notices posted by ADMIN / SUPER_ADMIN only.
 *
 * IMPORTANT: Announcements are NOT tasks. They have no completion status,
 * no due date and are stored in their own `announcements` table, so they are
 * never counted in any task totals/statistics system-wide (public board,
 * dashboards, Task Management…). Everyone can READ them; only admins can
 * create/edit/delete them (enforced by RLS in supabase/schema.sql).
 */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  author_id: string | null;
  created_at?: string;
  updated_at?: string;
  /** Resolved author name (from profiles), for display. */
  author_name?: string;

  /* ── 5W1H details (optional — only WHAT/title is required to publish) ────
   * WHO    → whois      · the person/s office the notice concerns
   * WHAT   → title + body (the announcement itself — REQUIRED)
   * WHEN   → when       · date/time the announced event happens
   * WHERE  → whereis    · place of the announced event
   * WHY    → why        · reason / background
   * HOW    → how        · mechanics / action expected from staff            */
  whois?: string | null;
  when?: string | null;
  whereis?: string | null;
  why?: string | null;
  how?: string | null;
  /** Visibility toggle — hidden announcements are kept (not deleted) but are
   *  NOT shown on the public dashboard ticker / News panel. */
  is_visible?: boolean;
}

/** The 5W1H extra fields (everything except WHAT = title/body). */
export type AnnouncementDetails = {
  [K in 'whois' | 'when' | 'whereis' | 'why' | 'how']?: string | null;
};

export const EMPTY_5W1H: Required<AnnouncementDetails> = {
  whois: '',
  when: '',
  whereis: '',
  why: '',
  how: '',
};

/** Read the 5W1H values of an announcement with safe fallbacks. */
export function fiveW1H(a: Announcement): Required<AnnouncementDetails> {
  return {
    whois: a.whois ?? '',
    when: a.when ?? '',
    whereis: a.whereis ?? '',
    why: a.why ?? '',
    how: a.how ?? '',
  };
}

/** True when at least one of the optional 5W1H fields has content. */
export function hasFiveW1H(a: Announcement): boolean {
  const d = fiveW1H(a);
  return Object.values(d).some((v) => (v ?? '').trim().length > 0);
}

/** Minimal registered-user row used by the "Make Announcement" WHO picker. */
export interface RegisteredUserOption {
  id: string;
  full_name: string | null;
  position: string | null;
}

/**
 * Fetch the REGISTERED USERS (profiles) so the announcement form can offer a
 * "Registered Users" checkbox list for the WHO field. Names picked here are
 * stored in `whois` as a plain comma-separated list of full names.
 */
export async function fetchRegisteredUsers(): Promise<RegisteredUserOption[]> {
  const res = await supabase
    .from('profiles')
    .select('id,full_name,position')
    .order('full_name');
  if (res.error) return [];
  return (res.data ?? []) as RegisteredUserOption[];
}

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (res.error) {
      // Table may not exist yet on databases where schema.sql hasn't been
      // re-run — degrade gracefully instead of breaking the page.
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setError(null);
    const rows = (res.data ?? []) as Announcement[];

    // Resolve author names (best-effort; public profile fields only).
    const authorIds = [...new Set(rows.map((r) => r.author_id).filter(Boolean))] as string[];
    let nameMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const pres = await supabase
        .from('profiles')
        .select('id,full_name')
        .in('id', authorIds);
      if (!pres.error) {
        nameMap = new Map(
          ((pres.data ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [
            p.id,
            p.full_name ?? 'Staff',
          ]),
        );
      }
    }
    setAnnouncements(rows.map((r) => ({ ...r, author_name: r.author_id ? nameMap.get(r.author_id) ?? 'Staff' : 'System' })));
    setLoading(false);
  }, []);

  // Keep a ref to the latest fetchData so realtime / interval closures never
  // go stale and the subscription effect runs exactly once per mount.
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  // Initial load + periodic safety refresh.
  useEffect(() => {
    fetchRef.current();
    const timer = window.setInterval(() => fetchRef.current(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Live updates through a PRIVATE, unique channel topic.
  // ---------------------------------------------------------------------------
  // Previously this used `supabase.channel('announcements')`. Supabase keys
  // channels by topic, so when two components mounted at once (AppLayout shell
  // + the Announcements page, or React 18 StrictMode double-effects) they got
  // the SAME channel object. The second `.on('postgres_changes', …)` call after
  // the first one already ran `.subscribe()` threw:
  //   "cannot add `postgres_changes` callbacks for realtime:announcements
  //    after `subscribe()`"
  // which crashed the Announcements tab with the ErrorBoundary screen.
  // `useRealtimeTableChanges` creates one unique topic per hook instance and
  // tears it down defensively — no collisions, no throws.
  // ---------------------------------------------------------------------------
  useRealtimeTableChanges('announcements', ['announcements'], useCallback(
    () => fetchRef.current(),
    [],
  ));

  const create = useCallback(
    async (
      input: { title: string; body: string; authorId: string | null; is_visible?: boolean } & AnnouncementDetails,
    ) => {
      const { error: err } = await supabase.from('announcements').insert({
        title: input.title.trim(),
        // WHAT is required, but the message/5W1H parts are optional.
        body: input.body.trim(),
        author_id: input.authorId,
        whois: input.whois?.trim() || null,
        when: input.when?.trim() || null,
        whereis: input.whereis?.trim() || null,
        why: input.why?.trim() || null,
        how: input.how?.trim() || null,
        is_visible: input.is_visible !== false,
      });
      if (err) return { error: err.message };
      await fetchData();
      return {};
    },
    [fetchData],
  );

  const update = useCallback(
    async (
      id: string,
      input: { title: string; body: string; is_visible?: boolean } & AnnouncementDetails,
    ) => {
      const { error: err } = await supabase
        .from('announcements')
        .update({
          title: input.title.trim(),
          body: input.body.trim(),
          updated_at: new Date().toISOString(),
          whois: input.whois?.trim() || null,
          when: input.when?.trim() || null,
          whereis: input.whereis?.trim() || null,
          why: input.why?.trim() || null,
          how: input.how?.trim() || null,
          ...(input.is_visible === undefined ? {} : { is_visible: input.is_visible }),
        })
        .eq('id', id);
      if (err) return { error: err.message };
      await fetchData();
      return {};
    },
    [fetchData],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from('announcements').delete().eq('id', id);
      if (err) return { error: err.message };
      await fetchData();
      return {};
    },
    [fetchData],
  );

  /** Show / hide an announcement WITHOUT deleting it. Hidden announcements
   *  disappear from the public dashboard ticker & News panel but remain in
   *  the Announcements page for admins (marked "Hidden"). */
  const setVisible = useCallback(
    async (id: string, visible: boolean) => {
      const { error: err } = await supabase
        .from('announcements')
        .update({ is_visible: visible, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (err) return { error: err.message };
      // Optimistically flip the local copy so the button reacts instantly.
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, is_visible: visible } : a)));
      await fetchData();
      return {};
    },
    [fetchData],
  );

  return { announcements, loading, error, create, update, remove, setVisible };
}
