// =====================================================================
// Recurrence helpers — due-date computation, occurrence generation and
// effective-status resolution (Complete / Pending / Overdue).
//
// A recurring task stores its *template* due date plus recurrence rules:
//   • frequency = 'daily'   → repeats on the selected days_of_week
//                             (empty list + repeat_forever = every day)
//   • frequency = 'weekly'  → same weekday as the template date
//   • monthly / quarterly / semester / yearly → same day-of-month
// The *effective* status of a recurring task is derived from its next
// unfinished occurrence, so "Overdue" always reflects the real deadline.
// =====================================================================
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
import type { TaskFrequency } from './types';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Index convention: 0 = Monday … 6 = Sunday (ISO-8601). */
export const ALL_WEEKDAYS: number[] = [0, 1, 2, 3, 4, 5, 6];
export const MON_FRI: number[] = [0, 1, 2, 3, 4];
export const WEEKEND: number[] = [5, 6];

/** ISO weekday (1 = Mon … 7 = Sun) mapped to our 0-based index. */
export function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function normalizeDays(days?: number[] | null): number[] {
  if (!days || !Array.isArray(days)) return [];
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
}

export function isRecurring(frequency?: TaskFrequency | string | null): boolean {
  return !!frequency && frequency !== 'one-time';
}

/**
 * Next occurrence strictly after `from`, or null when the recurrence has
 * ended (i.e. `repeat_forever` is false and the template date passed).
 */
export function nextOccurrence(
  input: {
    frequency?: TaskFrequency | null;
    due_date?: string | null;
    days_of_week?: number[] | null;
    repeat_forever?: boolean | null;
  },
  from: Date,
): Date | null {
  const freq = input.frequency ?? 'one-time';
  if (freq === 'one-time') return null;

  const baseDate = input.due_date ? startOfDaySafe(parseISO(input.due_date.slice(0, 10))) : null;
  const floor = addDays(startOfDay(from), 1); // occurrences strictly after `from`

  const withinLimit = (d: Date) => (input.repeat_forever ? true : !baseDate || d >= baseDate);

  switch (freq) {
    case 'daily': {
      const days = normalizeDays(input.days_of_week);
      // No specific weekdays chosen → literally every calendar day.
      if (days.length === 0) {
        const d = new Date(floor);
        return withinLimit(d) ? d : null;
      }
      for (let i = 0; i < 371; i++) {
        const d = addDays(floor, i);
        if (days.includes(isoWeekday(d))) return withinLimit(d) ? d : null;
      }
      return null;
    }
    case 'weekly': {
      if (!baseDate) return null;
      const target = isoWeekday(baseDate);
      for (let i = 0; i < 14; i++) {
        const d = addDays(floor, i);
        if (isoWeekday(d) === target) return withinLimit(d) ? d : null;
      }
      return null;
    }
    case 'monthly':
    case 'quarterly':
    case 'semester':
    case 'yearly': {
      if (!baseDate) return null;
      const step = freq === 'quarterly' ? 3 : freq === 'semester' ? 6 : freq === 'yearly' ? 12 : 1;
      const dom = baseDate.getDate();
      for (let k = 0; k <= 600; k++) {
        const raw = addMonths(baseDate, step * (k + 1));
        const clamped = clampToMonth(raw.getFullYear(), raw.getMonth(), dom);
        if (clamped >= floor) return withinLimit(clamped) ? clamped : null;
      }
      return null;
    }
    default:
      return null;
  }
}

function clampToMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return startOfDaySafe(new Date(year, month, Math.min(day, lastDay)));
}

function startOfDaySafe(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Upcoming occurrences (including today) starting at/after `from`. */
export function upcomingOccurrences(
  input: Parameters<typeof nextOccurrence>[0],
  from: Date,
  count = 3,
): Date[] {
  const out: Date[] = [];
  let cursor = addDays(startOfDay(from), -1);
  for (let i = 0; i < count; i++) {
    const nxt = nextOccurrence(input, cursor);
    if (!nxt) break;
    out.push(nxt);
    cursor = nxt;
  }
  return out;
}

/**
 * Resolve the *effective* status of a task right now.
 *  • completed            → 'completed'
 *  • non-recurring        → 'overdue' when the due date already passed
 *  • recurring            → evaluated against the latest occurrence ≤ today
 */
export function resolveTaskStatus(task: any, now: Date = new Date()): 'completed' | 'pending' | 'overdue' {
  if (task.status === 'completed') return 'completed';
  const today = startOfDay(now);

  // Any stored status other than 'completed'/'pending' (legacy 'in-progress',
  // null, stale values) is treated as PENDING so it always lands on the
  // Pending card instead of slipping through every filter.
  const pendingish = (): 'completed' | 'pending' | 'overdue' => {
    if (!task.due_date) return 'pending';
    const due = startOfDaySafe(parseISO(String(task.due_date).slice(0, 10)));
    return due < today ? 'overdue' : 'pending';
  };

  if (!isRecurring(task.frequency)) {
    if (task.status !== 'pending') return pendingish();
    if (!task.due_date) return 'pending';
    const due = startOfDaySafe(parseISO(String(task.due_date).slice(0, 10)));
    return due < today ? 'overdue' : 'pending';
  }

  // Find the most recent occurrence that is due today or earlier.
  let latest: Date | null = null;
  if (task.due_date) {
    const base = startOfDaySafe(parseISO(String(task.due_date).slice(0, 10)));
    if (base <= today) latest = base;
  }
  let probe = latest ?? startOfDaySafe(parseISO(String(task.due_date ?? today).slice(0, 10)));
  for (let i = 0; i < 800; i++) {
    const nxt = nextOccurrence(task, probe);
    if (!nxt || nxt > today) break;
    latest = nxt;
    probe = nxt;
  }
  if (!latest) return 'pending';
  return latest < today ? 'overdue' : 'pending';
}

/** Human summary of the recurrence rule, e.g. "Daily · Mon–Fri". */
export function describeRecurrence(task: {
  frequency?: TaskFrequency | null;
  days_of_week?: number[] | null;
  repeat_forever?: boolean | null;
}): string {
  const freq = task.frequency ?? 'one-time';
  if (freq === 'one-time') return 'One-time';
  const days = normalizeDays(task.days_of_week);
  if (freq === 'daily') {
    if (days.length === 0) return 'Daily · every day';
    if (sameSet(days, MON_FRI)) return 'Daily · Mon–Fri (weekdays)';
    if (sameSet(days, ALL_WEEKDAYS)) return 'Daily · all days of the week';
    return `Daily · ${days.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
  }
  const label = freq.charAt(0).toUpperCase() + freq.slice(1).replace('-', ' ');
  return task.repeat_forever ? `${label} · repeats forever` : `${label}`;
}

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function formatOccurrence(d: Date): string {
  return format(d, 'MMM d, yyyy');
}

/** Days remaining until the next deadline (negative = overdue by N days). */
export function daysUntil(dateStr: string | null, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const due = startOfDaySafe(parseISO(String(dateStr).slice(0, 10)));
  return differenceInCalendarDays(due, startOfDay(now));
}
