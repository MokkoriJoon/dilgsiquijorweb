import type { Task, TaskFrequency } from './types';
import { WEEK_DAYS } from './types';

/** Local date -> 'YYYY-MM-DD' */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a 'YYYY-MM-DD' key into a local Date at midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

/**
 * Advance a base date by one occurrence according to the frequency.
 * For 'daily' tasks with selected weekdays, moves to the next selected day.
 */
export function advanceDate(
  base: Date,
  frequency: TaskFrequency,
  weekdays?: number[] | null,
): Date {
  switch (frequency) {
    case 'daily': {
      if (weekdays && weekdays.length > 0) {
        let cursor = addDays(base, 1);
        for (let i = 0; i < 14; i++) {
          if (weekdays.includes(cursor.getDay())) return cursor;
          cursor = addDays(cursor, 1);
        }
        return cursor;
      }
      return addDays(base, 1);
    }
    case 'weekly':
      return addDays(base, 7);
    case 'monthly':
      return addMonths(base, 1);
    case 'quarterly':
      return addMonths(base, 3);
    case 'semester':
      return addMonths(base, 6);
    case 'yearly':
      return addMonths(base, 12);
    default:
      return base;
  }
}

/**
 * Compute the next occurrence strictly after `after`, starting from the
 * original due date. Recurses through every missed period so that a task
 * whose recurrence fell behind still resolves to the correct upcoming date.
 */
export function computeNextDueDate(task: Task, after: Date): Date | null {
  if (task.frequency === 'one-time') return null;
  let candidate = new Date(
    task.last_occurrence_date ?? task.due_date ?? after,
  );
  // Guard against pathological loops (e.g. data anomalies).
  for (let i = 0; i < 3660; i++) {
    const next = advanceDate(candidate, task.frequency, task.weekdays);
    if (next > after) return next;
    candidate = next;
  }
  return null;
}

/**
 * Effective display status of a task. The stored status is only ever
 * 'pending' or 'completed'; 'overdue' is derived when the current deadline
 * has passed. Recurring tasks roll forward automatically: if the stored
 * deadline already passed but a later occurrence falls today or beyond,
 * the task is NOT overdue — it simply belongs to the next cycle.
 */
export function effectiveStatus(task: Task, now: Date = new Date()): Task['status'] {
  if (task.status === 'completed') return 'completed';
  const deadlineStr = task.next_due_date ?? task.due_date;
  if (!deadlineStr) return 'pending';
  const deadline = new Date(deadlineStr);
  return deadline.getTime() < now.getTime() ? 'overdue' : 'pending';
}

/** The live deadline of a task (rolls forward for recurring tasks). */
export function effectiveDeadline(task: Task): string | null {
  return task.next_due_date ?? task.due_date;
}

/** Whole calendar days between today and the deadline (negative = past). */
export function daysUntilDeadline(task: Task, now: Date = new Date()): number | null {
  const dl = effectiveDeadline(task);
  if (!dl) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(dl);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay.getTime() - start.getTime()) / 86_400_000);
}

export function formatWeekdays(weekdays: number[] | null | undefined): string | null {
  if (!weekdays || weekdays.length === 0) return null;
  const sorted = [...weekdays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return sorted
    .map((idx) => WEEK_DAYS.find((w) => w.idx === idx)?.short ?? '')
    .filter(Boolean)
    .join(', ');
}
