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
import type { Task, TaskAssignment, TaskFrequency } from './types';

export interface OccurrenceCompletion {
  task_id: string;
  occurrence_date: string;
  user_id: string;
  completed: boolean;
  completed_at?: string | null;
  completion_note?: string | null;
  completed_by?: string | null;
}

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
    start_date?: string | null;
    days_of_week?: number[] | null;
    repeat_forever?: boolean | null;
  },
  from: Date,
): Date | null {
  const first = findNextOccurrence(input, from);
  if (!first || input.repeat_forever !== false) return first;

  const anchor = recurrenceAnchor(input);
  if (!anchor) return first;
  const initial = findNextOccurrence(input, addDays(anchor, -1));
  return initial && first.getTime() === initial.getTime() ? first : null;
}

function recurrenceAnchor(input: {
  due_date?: string | null;
  start_date?: string | null;
}): Date | null {
  const date = input.start_date ?? input.due_date;
  return date ? startOfDaySafe(parseISO(date.slice(0, 10))) : null;
}

function findNextOccurrence(
  input: {
    frequency?: TaskFrequency | null;
    due_date?: string | null;
    start_date?: string | null;
    days_of_week?: number[] | null;
  },
  from: Date,
): Date | null {
  const freq = input.frequency ?? 'one-time';
  if (freq === 'one-time') return null;

  const baseDate = recurrenceAnchor(input);
  const afterFrom = addDays(startOfDay(from), 1); // occurrences strictly after `from`
  const floor = baseDate && afterFrom < baseDate ? baseDate : afterFrom;

  switch (freq) {
    case 'daily': {
      const days = normalizeDays(input.days_of_week);
      // No specific weekdays chosen → literally every calendar day.
      if (days.length === 0) {
        return new Date(floor);
      }
      for (let i = 0; i < 371; i++) {
        const d = addDays(floor, i);
        if (days.includes(isoWeekday(d))) return d;
      }
      return null;
    }
    case 'weekly': {
      if (!baseDate) return null;
      if (baseDate >= floor) return baseDate;
      const target = isoWeekday(baseDate);
      for (let i = 0; i < 14; i++) {
        const d = addDays(floor, i);
        if (isoWeekday(d) === target) return d;
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
        const raw = addMonths(baseDate, step * k);
        const clamped = clampToMonth(raw.getFullYear(), raw.getMonth(), dom);
        if (clamped >= floor) return clamped;
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
 * Expand recurring templates into independently trackable dated occurrences.
 * Includes every scheduled date through the next date after today, so missed
 * dates stay visible while the current/next due date can also be completed.
 */
export function expandTaskOccurrences(
  tasks: Task[],
  completions: OccurrenceCompletion[],
  now: Date = new Date(),
): Task[] {
  const completedByOccurrence = new Map<string, Map<string, OccurrenceCompletion>>();
  for (const completion of completions) {
    const key = `${completion.task_id}|${completion.occurrence_date}`;
    const users = completedByOccurrence.get(key) ?? new Map<string, OccurrenceCompletion>();
    users.set(completion.user_id, completion);
    completedByOccurrence.set(key, users);
  }

  const today = startOfDay(now);
  const expanded: Task[] = [];
  for (const task of tasks) {
    if (!isRecurring(task.frequency) || task.status === 'completed') {
      expanded.push(task);
      continue;
    }

    const anchor = recurrenceAnchor(task);
    if (!anchor) {
      expanded.push(task);
      continue;
    }

    let cursor = addDays(anchor, -1);
    const nextAfterToday = nextOccurrence(task, today);
    const through = nextAfterToday ?? today;
    let firstOccurrence = true;
    for (let i = 0; i < 10000; i++) {
      const occurrence = nextOccurrence(task, cursor);
      if (!occurrence || occurrence > through) break;
      const occurrenceDate = format(occurrence, 'yyyy-MM-dd');
      const key = `${task.id}|${occurrenceDate}`;
      const userCompletions = completedByOccurrence.get(key);
      const assignments: TaskAssignment[] = (task.assignments ?? []).map((assignment) => {
        const completion = userCompletions?.get(assignment.user_id);
        return {
          ...assignment,
          completed: !!completion?.completed,
          completed_at: completion?.completed_at ?? null,
          completion_note: completion?.completion_note ?? null,
          completed_by: completion?.completed_by ?? null,
        };
      });
      const allComplete = assignments.length > 0
        ? assignments.every((assignment) => assignment.completed)
        : Array.from(userCompletions?.values() ?? []).some((completion) => completion.completed);
      expanded.push({
        ...task,
        id: `${task.id}::occurrence::${occurrenceDate}`,
        series_id: task.id,
        series_due_date: task.due_date,
        occurrence_date: occurrenceDate,
        is_first_occurrence: firstOccurrence,
        due_date: `${occurrenceDate}T09:00:00.000Z`,
        status: allComplete ? 'completed' : 'pending',
        completed_at: allComplete
          ? assignments.map((assignment) => assignment.completed_at).filter(Boolean).sort().slice(-1)[0] ?? null
          : null,
        completed_by: allComplete ? assignments[0]?.completed_by ?? null : null,
        completion_note: allComplete ? assignments[0]?.completion_note ?? null : null,
        assignments,
      });
      firstOccurrence = false;
      cursor = occurrence;
    }
  }
  return expanded;
}

export function occurrenceIdentity(id: string): { taskId: string; date: string } | null {
  const marker = '::occurrence::';
  const index = id.lastIndexOf(marker);
  if (index < 0) return null;
  return { taskId: id.slice(0, index), date: id.slice(index + marker.length) };
}

/**
 * Resolve the *effective* status of a task right now.
 *  • completed            → 'completed'
 *  • non-recurring        → 'overdue' when the due date already passed
 *  • recurring            → overdue if any scheduled occurrence before today
 */
export function resolveTaskStatus(task: any, now: Date = new Date()): 'completed' | 'pending' | 'overdue' {
  if (task.status === 'completed') return 'completed';
  const today = startOfDay(now);
  if (task.occurrence_date) {
    const due = startOfDaySafe(parseISO(task.occurrence_date));
    return due < today ? 'overdue' : 'pending';
  }

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

  const anchor = recurrenceAnchor(task);
  if (!anchor) return 'pending';
  const firstDue = nextOccurrence(task, addDays(anchor, -1));
  if (!firstDue || firstDue > today) return 'pending';
  return firstDue < today ? 'overdue' : 'pending';
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
