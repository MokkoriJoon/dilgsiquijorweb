import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  EyeOff,
  Info,
  Megaphone,
  PartyPopper,
  Users,
  X,
} from 'lucide-react';
import type { Announcement } from '../lib/useAnnouncements';
import { fiveW1H } from '../lib/useAnnouncements';

/**
 * ============================================================================
 * ANNOUNCEMENT MODAL / NOTIFICATION MODAL
 * ----------------------------------------------------------------------------
 * The pop-up used when the app needs to **deliver an alert, a news update or an
 * invitation to read a new announcement**.
 *
 * Behaviour required by the spec:
 *  • Always sits in the MIDDLE / CENTRE of the device screen — both vertically
 *    and horizontally (`fixed inset-0` + flex centering), on phones as well as
 *    desktops, and it stays centred even while the on-screen keyboard is open.
 *  • SCROLLABLE — the panel is capped at `max-h-[92dvh]` (dynamic viewport
 *    height, so mobile browser chrome is respected) with a STICKY header and a
 *    STICKY footer, while only the body between them scrolls. Long notices get
 *    an internal "Read more / Read less" expander so the modal never becomes an
 *    endless page, and the whole modal also fits short screens by shrinking.
 *
 * Two flavours are supported through the same component:
 *  1. `<AnnouncementModal … />`            → renders one or many announcements
 *     (with prev/next navigation + unread dots) — used for alerts / news /
 *     "you have a new announcement" invitations.
 *  2. `<AnnouncementModal.Alert … />`      → a plain alert-style notification
 *     popup (title + message + single acknowledgement button).
 * ==========================================================================*/

export type AnnouncementModalTone = 'info' | 'news' | 'alert' | 'invite';

const TONE_META: Record<
  AnnouncementModalTone,
  {
    icon: typeof Info;
    chip: string;
    /** Static text-colour class for the tone label (kept literal so Tailwind
     *  generates it — never derived with split()). */
    fg: string;
    bar: string;
    ring: string;
    label: string;
    emoji: string;
  }
> = {
  info: {
    icon: Info,
    chip: 'bg-blue-50',
    fg: 'text-blue-700',
    bar: 'from-blue-600 to-sky-500',
    ring: 'focus-visible:ring-blue-500',
    label: 'Notice',
    emoji: 'ℹ️',
  },
  news: {
    icon: Megaphone,
    chip: 'bg-indigo-50',
    fg: 'text-indigo-700',
    bar: 'from-indigo-600 to-blue-600',
    ring: 'focus-visible:ring-indigo-500',
    label: 'News update',
    emoji: '📢',
  },
  alert: {
    icon: AlertTriangle,
    chip: 'bg-red-50',
    fg: 'text-red-700',
    bar: 'from-red-600 to-orange-500',
    ring: 'focus-visible:ring-red-500',
    label: 'Important alert',
    emoji: '🚨',
  },
  invite: {
    icon: PartyPopper,
    chip: 'bg-emerald-50',
    fg: 'text-emerald-700',
    bar: 'from-emerald-600 to-teal-500',
    ring: 'focus-visible:ring-emerald-500',
    label: "You're invited to read this",
    emoji: '✨',
  },
};

/** "2026-10-29T08:00:00Z" → "Oct 29, 2026, 8:00 AM" (safe fallback to raw). */
function formatStamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Pick the tone automatically from the notice itself (admin urgency wins). */
function autoTone(a?: Announcement): AnnouncementModalTone {
  if (!a) return 'info';
  if (a.is_visible === false) return 'alert';
  const text = `${a.title} ${a.body ?? ''}`.toLowerCase();
  if (/(urgent|immediat|overdue|critical|warning|error|failed|cancel|interrupt|alert)/.test(text))
    return 'alert';
  if (/(invitation|invite|you are invited|please join|kindly attend|launch|grand)/.test(text))
    return 'invite';
  return 'news';
}

/** One labelled 5W1H row (rendered only when it carries content). */
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="flex-shrink-0 w-14 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 pt-0.5">
        {label}
      </span>
      <span className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words min-w-0">
        {value}
      </span>
    </div>
  );
}

/** Message body with an internal "Read more" expander for very long notices. */
function ScrollableBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_MAX = 'calc(38vh)';
  const needsToggle = text.length > 480; // rough heuristic: ~8+ lines on a phone

  return (
    <div className="mt-3">
      <div
        className="overflow-y-auto overscroll-contain rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm text-gray-700 leading-relaxed whitespace-pre-line break-words [scrollbar-width:thin]"
        style={{ maxHeight: expanded ? 'none' : COLLAPSED_MAX }}
      >
        {text}
      </div>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
        >
          <ChevronDown size={13} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/* ────────────────────────────── MAIN MODAL ─────────────────────────────── */

export interface AnnouncementModalProps {
  /** True while the modal should be on screen. */
  open: boolean;
  onClose: () => void;
  /** The announcement(s) being delivered. Newest first is expected. */
  announcements: Announcement[];
  /** Headline of the popup itself (defaults per tone). */
  heading?: string;
  /** Sub-line under the headline, e.g. "2 new notices from your Provincial Office". */
  subheading?: string;
  tone?: AnnouncementModalTone;
  /** Ids considered unread — drives the blue dots + the "N new" chip. */
  unreadIds?: string[];
  /** Fired every time the visible notice changes (use it to mark as read). */
  onView?: (a: Announcement) => void;
  /** Optional primary action, e.g. "Open Announcements page". */
  actionLabel?: string;
  onAction?: () => void;
  /** Label of the dismiss button (default "Got it"). */
  dismissLabel?: string;
  /** Allow Esc / backdrop click to close (default true). */
  closeOnBackdrop?: boolean;
  /** Width cap of the centred panel. */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<AnnouncementModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

/**
 * Centred, scrollable announcement / notification pop-up.
 */
export default function AnnouncementModal({
  open,
  onClose,
  announcements,
  heading,
  subheading,
  tone,
  unreadIds = [],
  onView,
  actionLabel,
  onAction,
  dismissLabel = 'Got it',
  closeOnBackdrop = true,
  size = 'md',
}: AnnouncementModalProps) {
  const list = useMemo(() => announcements.filter(Boolean), [announcements]);
  const [idx, setIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  /** Latest onView handler — kept in a ref so the "viewed" effect below only
   *  fires when the SHOWN notice actually changes (never on parent re-renders). */
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  const current = list[Math.min(idx, Math.max(list.length - 1, 0))];
  const resolvedTone: AnnouncementModalTone = tone ?? autoTone(current);
  const meta = TONE_META[resolvedTone];
  const Icon = meta.icon;

  /* Keep the index valid when the list shrinks (live realtime updates). */
  useEffect(() => {
    setIdx((i) => (list.length === 0 ? 0 : Math.min(i, list.length - 1)));
  }, [list.length]);

  /* Tell the parent which notice the user is actually looking at (viewing a
     notice counts as reading it — used to mark it read / clear the badge). */
  useEffect(() => {
    if (open && current) onViewRef.current?.(current);
  }, [open, current?.id]);

  /* Escape closes + lock the page behind the modal while it is open. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog for keyboard/screen-reader users.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const unreadSet = new Set(unreadIds);
  const unreadCount = list.filter((a) => unreadSet.has(a.id)).length;
  const details = current ? fiveW1H(current) : null;
  const hasDetails =
    !!details && Object.values(details).some((v) => (v ?? '').trim().length > 0);

  return (
    // ── FULL-SCREEN BACKDROP — the panel is centred VERTICALLY & HORIZONTALLY
    //    in the middle of the device screen (p-4 keeps it off the edges).
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-modal-title"
    >
      {closeOnBackdrop && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      )}
      {!closeOnBackdrop && <div className="absolute inset-0 bg-black/60" aria-hidden />}

      {/* ── PANEL — max-h-[92dvh]: never taller than the screen, body scrolls ── */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex w-full ${SIZE_CLASS[size]} max-h-[92dvh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none animate-[annModalIn_.22s_ease-out]`}
      >
        {/* Accent bar */}
        <div className={`h-1.5 w-full flex-shrink-0 bg-gradient-to-r ${meta.bar}`} />

        {/* ── STICKY HEADER (does not scroll with the content) ── */}
        <header className="flex flex-shrink-0 items-start gap-3 border-b border-gray-100 px-4 py-3.5 sm:px-5">
          <div className={`rounded-xl p-2.5 ${meta.chip} flex-shrink-0`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] font-extrabold uppercase tracking-widest ${meta.fg}`}>
              {meta.emoji} {meta.label}
            </p>
            <h2
              id="announcement-modal-title"
              className="text-base sm:text-lg font-bold text-gray-800 leading-snug break-words"
            >
              {heading ?? current?.title ?? 'Announcement'}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5 break-words">
              {subheading ??
                (list.length > 1
                  ? `${list.length} notices${unreadCount > 0 ? ` · ${unreadCount} new` : ''}`
                  : current
                    ? `${current.author_name ?? 'System'}${
                        current.created_at ? ` · ${formatStamp(current.created_at)}` : ''
                      }`
                    : '')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close announcement"
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </header>

        {/* ── BODY — the ONLY scrolling region (scrollable by requirement) ── */}
        <div className="ann-modal-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 [scrollbar-width:thin]">
          {list.length === 0 ? (
            <div className="py-10 text-center">
              <Megaphone size={26} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-600">Nothing to read right now</p>
              <p className="text-xs text-gray-400 mt-1">New announcements will appear here.</p>
            </div>
          ) : (
            <article key={current!.id}>
              {current!.is_visible === false && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-[10px] font-bold mb-2">
                  <EyeOff size={11} /> Hidden — not shown on the public board
                </span>
              )}

              {list.length > 1 && heading && (
                // When a custom heading replaces the notice title, show the
                // title inside the body so nothing is lost.
                <h3 className="text-sm font-bold text-gray-800 leading-snug break-words">
                  {current!.title}
                </h3>
              )}

              {current!.body?.trim() ? (
                <ScrollableBody text={current!.body.trim()} />
              ) : (
                <p className="mt-3 text-sm text-gray-500 italic">No additional message.</p>
              )}

              {hasDetails && (
                <div className="mt-4 rounded-xl border border-gray-100 bg-white px-3 py-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 px-1 pb-1">
                    Details (5W1H)
                  </p>
                  <DetailRow label="Who" value={details!.whois} />
                  <DetailRow label="When" value={details!.when} />
                  <DetailRow label="Where" value={details!.whereis} />
                  <DetailRow label="Why" value={details!.why} />
                  <DetailRow label="How" value={details!.how} />
                </div>
              )}

              {/* Quick-glance WHO / WHEN strip (the full 5W1H box above stays
                  collapsed unless those fields were filled in). */}
              {(current!.whois?.trim() || current!.when?.trim()) && !hasDetails && (
                <div className="mt-3 space-y-1">
                  {current!.whois?.trim() && (
                    <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                      <Users size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="break-words">Audience: {current!.whois}</span>
                    </p>
                  )}
                  {current!.when?.trim() && (
                    <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                      <CalendarDays size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="break-words">Schedule: {current!.when}</span>
                    </p>
                  )}
                </div>
              )}
            </article>
          )}
        </div>

        {/* ── STICKY FOOTER (never scrolls away) ── */}
        <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-5">
          {list.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Previous announcement"
              >
                ‹ Prev
              </button>
              <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                {Math.min(idx + 1, list.length)} / {list.length}
              </span>
              <button
                type="button"
                onClick={() => setIdx((i) => (i + 1) % list.length)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Next announcement"
              >
                Next ›
              </button>
              {/* Unread dots — tap to jump straight to a new notice. */}
              <div className="ml-1 hidden sm:flex items-center gap-1">
                {list.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    title={`${a.title}${unreadSet.has(a.id) ? ' — new' : ''}`}
                    onClick={() => setIdx(i)}
                    className={`h-2 w-2 rounded-full transition-all ${
                      i === idx
                        ? 'bg-blue-600 scale-125'
                        : unreadSet.has(a.id)
                          ? 'bg-blue-300'
                          : 'bg-gray-300'
                    }`}
                    aria-label={`Show announcement ${i + 1}: ${a.title}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">
              Press <kbd className="rounded border border-gray-300 bg-white px-1 font-sans">Esc</kbd> to close
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={() => {
                  onAction();
                  onClose();
                }}
                className={`rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${meta.ring}`}
              >
                {actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              {dismissLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ────────────────────────── ALERT-STYLE VARIANT ────────────────────────── */

export interface AnnouncementAlertProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  tone?: AnnouncementModalTone;
  /** Optional kicker above the title, e.g. "System alert". */
  eyebrow?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

/**
 * `AnnouncementModal.Alert` — the lightweight alert/notification flavour of the
 * same centred, scrollable pop-up (headline + message + acknowledge button).
 */
export function AnnouncementAlert({
  open,
  onClose,
  title,
  message,
  tone = 'alert',
  eyebrow,
  confirmLabel,
  onConfirm,
}: AnnouncementAlertProps) {
  const meta = TONE_META[tone];
  const Icon = meta.icon;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="announcement-alert-title"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative flex w-full max-w-md max-h-[92dvh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-[annModalIn_.22s_ease-out]">
        <div className={`h-1.5 w-full flex-shrink-0 bg-gradient-to-r ${meta.bar}`} />
        <div className="ann-modal-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2.5 ${meta.chip} flex-shrink-0`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              {eyebrow && (
                <p className={`text-[10px] font-extrabold uppercase tracking-widest ${meta.fg}`}>
                  {eyebrow}
                </p>
              )}
              <h2 id="announcement-alert-title" className="text-base font-bold text-gray-800 leading-snug break-words">
                {title}
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line break-words">
            {message}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ${
                tone === 'alert' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmLabel ?? 'Acknowledge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Attach the variant so pages can use <AnnouncementModal.Alert … /> too. */
AnnouncementModal.Alert = AnnouncementAlert;
