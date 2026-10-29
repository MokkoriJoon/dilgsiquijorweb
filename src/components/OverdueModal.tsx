import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarX2, CheckCircle2, Clock, ListChecks, X } from 'lucide-react';
import type { Task } from '../lib/types';
import { effectiveDueDate } from '../lib/useTasks';
import { overdueDaysLabel } from '../lib/notifications';

/** Days a task has slipped past its effective deadline (0 when unknown). */
export function overdueSlipDays(t: Task): number {
  const label = overdueDaysLabel(t);
  return Number(label.match(/\d+/)?.[0] ?? 0);
}

/**
 * ============================================================================
 * OVERDUE NOTIFICATION MODAL
 * ----------------------------------------------------------------------------
 * The pop-up that greets a staff member RIGHT AFTER LOGIN when they have tasks
 * past their deadline. Same shell rules as the Announcement / Notification
 * modal:
 *  • always in the MIDDLE / CENTRE of the device screen (fixed inset-0 + flex
 *    centering — phones and desktops alike);
 *  • SCROLLABLE — capped at `max-h-[92dvh]`, sticky header + sticky footer,
 *    only the task list between them scrolls.
 *
 * Behaviour:
 *  • lists every overdue task with how many days it slipped;
 *  • "Go to My Tasks" jumps straight to the task board;
 *  • closing is remembered per day (see shouldPopOverdue in lib/notifications)
 *    so the user is alerted on login but never spammed mid-session.
 * ============================================================================
 */
export interface OverdueModalProps {
  open: boolean;
  onClose: () => void;
  /** The signed-in user's overdue tasks (non-empty). */
  tasks: Task[];
}

function fmtDue(due?: string | null): string {
  if (!due) return '(no date)';
  const d = new Date(due);
  return isNaN(d.getTime())
    ? due.slice(0, 10)
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OverdueModal({ open, onClose, tasks }: OverdueModalProps) {
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Most-overdue first — the ones needing immediate action on top.
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => overdueSlipDays(b) - overdueSlipDays(a)),
    [tasks],
  );

  /* Esc closes; focus moves into the dialog when it opens. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    // Lock background scroll while the alert is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const [mounted] = useState(() => performance.now());
  void mounted; // (kept simple — animation handled by CSS keyframes)

  if (!open || tasks.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="overdue-modal-title"
      aria-describedby="overdue-modal-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />

      {/* Centred, scrollable panel */}
      <div className="relative flex w-full max-w-lg max-h-[92dvh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-[annModalIn_.22s_ease-out]">
        {/* Tone bar */}
        <div className="h-1.5 w-full flex-shrink-0 bg-gradient-to-r from-red-600 to-orange-500" />

        {/* Sticky header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl bg-red-50 p-2.5 text-red-600 flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-red-600">
                🚨 Action required
              </p>
              <h2 id="overdue-modal-title" className="text-lg font-bold text-gray-800 leading-snug">
                You have overdue {tasks.length === 1 ? 'task' : 'tasks'}
              </h2>
              <p id="overdue-modal-desc" className="text-xs text-gray-500 mt-0.5">
                {tasks.length} {tasks.length === 1 ? 'assignment is' : 'assignments are'} past the
                deadline. Please act on them immediately.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close overdue notification"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrolling body — ONLY this region scrolls */}
        <div className="ann-modal-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <ul className="space-y-2.5">
            {sorted.map((t) => {
              const due = effectiveDueDate(t) || t.due_date;
              return (
                <li
                  key={t.id}
                  className="rounded-xl border border-red-100 bg-red-50/40 p-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <CalendarX2 size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 leading-snug break-words">
                        {t.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} className="text-red-500" />
                          <span className="font-bold text-red-600">{overdueDaysLabel(t)}</span>
                        </span>
                        <span>Due: {fmtDue(due)}</span>
                        {t.category?.name && (
                          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-gray-600 border border-gray-200">
                            {t.category.name}
                          </span>
                        )}
                        {t.is_personal && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-600 border border-violet-100">
                            Personal
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-gray-400">
            Tip: you can also review these any time from the 🔔 bell — the same reminders live
            there under “🚨 OVERDUE”.
          </p>
        </div>

        {/* Sticky footer */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/app/tasks');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
          >
            <ListChecks size={15} />
            Go to My Tasks
          </button>
          <span className="mr-auto hidden sm:inline-flex items-center gap-1 text-[11px] text-gray-400">
            <CheckCircle2 size={12} /> Mark them complete to stop tomorrow&rsquo;s reminder
          </span>
        </div>
      </div>
    </div>
  );
}
