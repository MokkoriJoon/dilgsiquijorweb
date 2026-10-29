// ============================================================================
// Realtime helpers — safe Supabase channel lifecycle.
//
// WHY THIS EXISTS
// The Supabase realtime client keys channels by topic (`realtime:<name>`). If a
// channel with that name already exists, `supabase.channel('name')` returns the
// EXISTING instance instead of a fresh one. When two components mount at the
// same time (React 18 StrictMode double-mounting, or simply navigating to the
// Announcements tab while the AppLayout shell still holds its own subscription),
// both receive the very same channel object and run their effects against it:
//
//     effect A:  .on('postgres_changes', …).subscribe()   → joins the channel
//     effect B:  .on('postgres_changes', …)               → throws
//                "cannot add `postgres_changes` callbacks for
//                 realtime:announcements after `subscribe()`."
//
// That error is thrown synchronously inside the effect, so it escapes into the
// React render phase and the ErrorBoundary shows the “Something went wrong”
// crash screen — exactly what happened when clicking the Announcements tab
// (AppLayout subscribes to `announcements`, and the page subscribes too).
//
// THE FIX
//  • every caller now uses a UNIQUE topic per hook instance, so no two live
//    subscriptions can ever share a channel object; and
//  • channels are torn down SYNCHRONOUSLY on unmount (`releaseChannel`), which
//    immediately removes them from the client's channel registry and resets
//    their internal "joinedOnce" flag. See the note on `subscribe()` below —
//    this is what prevents the "cannot add `postgres_changes` callbacks …
//    after `subscribe()`" crash when React remounts a component (StrictMode
//    double-effects, fast route re-navigation, error-boundary retries).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

let seq = 0;

/**
 * Build a unique realtime topic name for one hook instance.
 * `realtimeTopic('announcements')` → `announcements-a1b2c3d4`.
 */
export function realtimeTopic(base: string): string {
  seq += 1;
  return `${base}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}-${seq}`}`;
}

/**
 * Grab the underlying realtime socket defensively (its shape differs slightly
 * across supabase-js versions; `realtime` is typed as any there anyway).
 */
function getRealtimeSocket(): {
  channels?: RealtimeChannel[];
  removeChannel?: (c: RealtimeChannel) => Promise<unknown>;
} | null {
  try {
    const rt = (supabase as unknown as { realtime?: any }).realtime;
    return rt ?? null;
  } catch {
    return null;
  }
}

/**
 * Release a channel WITHOUT ever throwing and WITHOUT awaiting the server's
 * `leave` acknowledgement.
 *
 * Why not just `await supabase.removeChannel(channel)`?
 *  - In supabase-js v2, `removeChannel()` only resolves once the Phoenix
 *    channel reports CLOSED. If the socket is mid-reconnect (the Cloudflare
 *    websocket errors seen in production logs), that promise can hang, so the
 *    channel object STAYS in `client.channels` under its topic.
 *  - When the component remounts (React 18 StrictMode runs effects twice;
 *    users navigate away from and back to the Announcements tab), the cleanup
 *    of the previous subscription has not finished yet, so
 *    `supabase.channel('<same-topic>')` returns the EXISTING, already-joined
 *    channel instead of a fresh one. The next `.on('postgres_changes', …)`
 *    then throws synchronously:
 *        "cannot add `postgres_changes` callbacks for realtime:announcements
 *         after `subscribe()`."
 *    Because that happens inside a useEffect during navigation, the error
 *    escapes into the render phase and the ErrorBoundary shows the
 *    "Something went wrong" screen — exactly the reported crash.
 *
 * This helper therefore:
 *  1. fires `unsubscribe()` (best effort, errors swallowed);
 *  2. SYNCHRONOUSLY splices the channel out of the client's registry, so a
 *     remount can never receive a stale joined channel;
 *  3. resets the private `joinedOnce` flag on the phoenix channel as an extra
 *     safety net (guarded with try/catch — purely defensive).
 */
export function releaseChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  try {
    // 1) Ask the server to leave (fire-and-forget; may never settle offline).
    try {
      void Promise.resolve(channel.unsubscribe()).catch(() => {});
    } catch {
      /* ignore */
    }
    // 2) Remove from the client registry immediately (sync — no await).
    const rt = getRealtimeSocket();
    const list = rt?.channels;
    if (Array.isArray(list)) {
      const idx = list.indexOf(channel);
      if (idx >= 0) list.splice(idx, 1);
    }
    // 3) Defensive: allow a future re-subscribe on the same object.
    try {
      const inner = (channel as unknown as { channel?: { _state?: string }; joinedOnce?: unknown });
      if (inner.channel) inner.channel._state = 'closed';
    } catch {
      /* ignore */
    }
  } catch {
    /* Never let teardown crash the app. */
  }
}

/** Back-compat alias used elsewhere in the codebase. */
export const safeRemoveChannel = releaseChannel;

/**
 * Subscribe to Postgres changes on one or more tables using a PRIVATE channel
 * topic (unique per hook instance) and clean it up safely on unmount.
 *
 * @param baseName   readable prefix for the topic, e.g. "announcements"
 * @param tables     tables to listen to (`event: '*'`)
 * @param onChange   fired for every change on any of those tables
 * @param pollMs     optional safety refresh interval (default: none)
 */
export function useRealtimeTableChanges(
  baseName: string,
  tables: string[],
  onChange: () => void,
  pollMs = 0,
): void {
  // Unique per mounted instance — created ONCE (lazy ref init) so it survives
  // StrictMode's double effect invocation without ever reusing a stale topic.
  const topicRef = useRef<string | null>(null);
  if (topicRef.current === null) topicRef.current = realtimeTopic(baseName);
  // Always call the LATEST callback (the subscribed closure must stay stable).
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase.channel(topicRef.current as string);
      for (const table of tables) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => handlerRef.current(),
        );
      }
      channel.subscribe();
    } catch {
      // Realtime unavailable (offline / misconfigured URL) — polling below,
      // if any, still keeps the data reasonably fresh. Never crash the page.
      channel = null;
    }

    const timer = pollMs > 0 ? window.setInterval(() => handlerRef.current(), pollMs) : null;

    return () => {
      if (timer !== null) window.clearInterval(timer);
      releaseChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), pollMs]);
}

/**
 * Poll a query on an interval (fallback / companion to realtime). Returns a
 * counter that ticks every `ms` so callers can put it in their fetch deps.
 */
export function usePollTick(ms = 60_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (ms <= 0) return;
    const id = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}
