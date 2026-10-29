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
//  • `safeRemoveChannel()` tears the channel down defensively (unsubscribe +
//    teardown + removal from the client's channel registry) inside try/catch,
//    so an in-flight join/leave can never crash the app on unmount.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

let seq = 0;

/**
 * Build a unique realtime topic name for one hook instance.
 * `realtimeTopic('announcements')` → `announcements-7` (channel `realtime:announcements-7`).
 */
export function realtimeTopic(base: string): string {
  seq += 1;
  return `${base}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}-${seq}`}`;
}

/**
 * Remove a channel without ever throwing.
 *
 * `supabase.removeChannel()` awaits the server `leave` ack; if the socket is
 * already closed / the channel errored, the promise may reject or never settle,
 * and an unhandled rejection during route change was another source of random
 * crashes. Swallow everything — worst case the channel simply stays idle.
 */
export function safeRemoveChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  try {
    void Promise.resolve(supabase.removeChannel(channel)).catch(() => {
      /* best effort */
    });
  } catch {
    try {
      // Last resort: force the local state so nothing keeps pushing on it.
      (channel as unknown as { unsubscribe?: () => void }).unsubscribe?.();
    } catch {
      /* ignore */
    }
  }
}

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
  // Unique per mounted instance — created once, stable across re-renders.
  const topicRef = useRef<string>(realtimeTopic(baseName));
  // Always call the LATEST callback (the subscribed closure must stay stable).
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase.channel(topicRef.current);
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
      safeRemoveChannel(channel);
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
