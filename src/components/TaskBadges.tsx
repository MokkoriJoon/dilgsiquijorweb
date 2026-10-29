import { useEffect, useRef, useState } from 'react';
import type { Task } from '../lib/types';
import { STATUS_META } from '../lib/taskMeta';
import { describeRecurrence, nextOccurrence, daysUntil } from '../lib/recurrence';
import { formatDueDate } from '../lib/useTasks';
import { CalendarDays, RefreshCw, Link2, Users } from 'lucide-react';

/**
 * Status / recurrence / category badges used by every task list.
 * ⚠️ Keep `../lib/recurrence` & `../lib/taskMeta` in sync — missing files here
 * break the Vite production build ("Could not resolve ./recurrence").
 */

export function StatusBadge({ status }: { status: 'completed' | 'pending' | 'overdue' }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function CategoryBadge({ task }: { task: Task }) {
  if (!task.category) return null;
  const color = task.category.color ?? '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
      title={task.category.description ?? undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {task.category.name}
    </span>
  );
}

export function RecurrenceBadge({ task }: { task: Task }) {
  if (task.frequency === 'one-time') return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700"
      title={describeRecurrence(task)}
    >
      <RefreshCw size={11} />
      {describeRecurrence(task)}
    </span>
  );
}

export function DueBadge({ task, status }: { task: Task; status: 'completed' | 'pending' | 'overdue' }) {
  const remaining = daysUntil(task.due_date);
  const overdueBy = status === 'overdue' && remaining !== null ? Math.abs(remaining) : null;
  const dueSoon = status === 'pending' && remaining !== null && remaining >= 0 && remaining <= 3;

  let tone = 'text-gray-500';
  if (status === 'overdue') tone = 'text-red-600 font-semibold';
  else if (dueSoon) tone = 'text-orange-600 font-semibold';

  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <CalendarDays size={12} />
      {status === 'completed'
        ? `Due ${formatDueDate(task.due_date)}`
        : `Due ${formatDueDate(task.due_date)}`}
      {overdueBy !== null && overdueBy > 0 && (
        <span className="text-[10px] rounded bg-red-100 px-1 py-0.5">
          {overdueBy} day{overdueBy === 1 ? '' : 's'} overdue
        </span>
      )}
      {dueSoon && remaining !== null && (
        <span className="text-[10px] rounded bg-orange-100 px-1 py-0.5">
          {remaining === 0 ? 'due today' : `${remaining} day${remaining === 1 ? '' : 's'} left`}
        </span>
      )}
    </span>
  );
}

/**
 * "Assigned: Name +N" — the "+N" chip is CLICKABLE (not hover-only): it opens
 * a small popover listing every user assigned to the task. Clicking anywhere
 * outside (or pressing Escape) closes it.
 */
export function AssigneeList({ task }: { task: Task }) {
  const people = task.assignee_profiles ?? [];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (people.length === 0) {
    return <span className="text-gray-400">Unassigned</span>;
  }
  if (people.length === 1) {
    return <span className="font-medium text-gray-600">{people[0].full_name ?? 'Staff'}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 relative" ref={ref}>
      <Users size={12} />
      <span className="font-medium text-gray-600">{people[0].full_name ?? 'Staff'}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[10px] rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold px-1.5 py-0.5 cursor-pointer transition-colors"
        title={`View all ${people.length} assigned users`}
        aria-expanded={open}
      >
        +{people.length - 1}
      </button>

      {open && (
        <span className="absolute left-0 top-full mt-1 z-30 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-2 block">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 px-1 pb-1">
            Assigned users ({people.length})
          </span>
          <span className="block max-h-40 overflow-y-auto divide-y divide-gray-50">
            {people.map((p) => (
              <span key={p.id} className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700">
                <Users size={11} className="text-gray-400 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium block truncate">{p.full_name ?? 'Staff'}</span>
                  {p.position && <span className="text-[10px] text-gray-400 block truncate">{p.position}</span>}
                </span>
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

export function LinksIndicator({ task }: { task: Task }) {
  const n = task.links?.length ?? 0;
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-blue-600" title={`${n} resource link(s)`}>
      <Link2 size={12} />
      {n}
    </span>
  );
}

/** Next scheduled occurrence hint for recurring tasks. */
export function NextRunHint({ task }: { task: Task }) {
  if (task.frequency === 'one-time' || task.status === 'completed') return null;
  const nxt = nextOccurrence(task, new Date());
  if (!nxt) return null;
  return (
    <span className="text-[11px] text-indigo-600">
      Next: {formatDueDate(nxt.toISOString())}
    </span>
  );
}
