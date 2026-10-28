// =====================================================================
// Shared dashboard helpers (used by AppDashboard, TaskManagement, MyTasks).
// Split out of AppDashboard.tsx so pages can import them without cycles.
// =====================================================================
import type { Task } from '../lib/types';

/** Convert a modal draft into the payload understood by useTasks. */
export function draftToPayload(draft: {
  title: string;
  description: string;
  due_date: string;
  frequency: string;
  days_of_week: number[];
  repeat_forever: boolean;
  category_id: string;
  assignees: string[];
  links: { label: string; url: string }[];
  status: 'pending' | 'completed';
  /** Personal (private) task — never counted in organization-wide totals. */
  is_personal?: boolean;
}) {
  return {
    title: draft.title,
    description: draft.description || null,
    due_date: draft.due_date ? new Date(`${draft.due_date}T09:00:00`).toISOString() : null,
    frequency: draft.frequency as Task['frequency'],
    days_of_week: draft.days_of_week,
    repeat_forever: draft.repeat_forever,
    category_id: draft.category_id || null,
    assigned_to: draft.assignees[0],
    assignees: draft.assignees,
    links: draft.links,
    status: draft.status,
    is_personal: !!draft.is_personal,
  };
}

export function Spinner() {
  return (
    <div className="py-20 flex justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
    </div>
  );
}

export function EmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
      <p className="text-gray-500 font-medium">
        {filtered ? 'No tasks match this filter.' : 'No tasks yet.'}
      </p>
      <p className="text-sm text-gray-400 mt-1">
        {filtered
          ? 'Click the active card again — or “Reset all filters” — to clear the filter.'
          : 'Assigned tasks will appear here.'}
      </p>
    </div>
  );
}
