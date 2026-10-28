import type { ResourceLink, Task, TaskCategory } from './types';
import { effectiveStatus, formatWeekdays } from './recurrence';

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Complete', cls: 'bg-green-100 text-green-700 border-green-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' },
};

export function StatusBadge({ task }: { task: Task }) {
  const status = effectiveStatus(task);
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category?: TaskCategory | null }) {
  if (!category) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: category.color || '#2563eb' }}
    >
      {category.name}
    </span>
  );
}

export function FrequencyBadge({ task }: { task: Task }) {
  const days = task.frequency === 'daily' ? formatWeekdays(task.weekdays) : null;
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 capitalize">
      {task.frequency.replace('-', ' ')}
      {days ? ` · ${days}` : ''}
    </span>
  );
}

/** Clickable resource links attached to a task. */
export function TaskLinks({
  links,
  onBookmark,
}: {
  links: ResourceLink[] | null | undefined;
  onBookmark?: (link: ResourceLink) => void;
}) {
  if (!links || links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {links.map((l, i) => (
        <span key={i} className="inline-flex items-center">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            title={l.url}
          >
            🔗 {l.title || l.url}
          </a>
          {onBookmark && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmark(l);
              }}
              title="Save to My Bookmarks"
              className="ml-1 text-gray-400 hover:text-amber-500 text-xs"
            >
              ★
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
