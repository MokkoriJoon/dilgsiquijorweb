import { useMemo, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useTasks, formatDueDate } from '../lib/useTasks';
import { useCategories } from '../lib/useCategories';
import type { Profile, Task } from '../lib/types';
import { ROLE_LABELS } from '../lib/types';
import { effectiveStatus, formatWeekdays } from '../lib/recurrence';
import { StatusBadge, CategoryBadge, FrequencyBadge, TaskLinks } from '../components/TaskBadges';
import {
  Search,
  FolderTree,
  Users,
  Clock,
  CalendarDays,
  ShieldAlert,
} from 'lucide-react';

/**
 * Task Management — global repository of ALL tasks ever created.
 * For admins/super admins: reusability reference + global edit entry point.
 * Standard users get a read-only view limited to their own assignments.
 */
export default function TaskManagement() {
  const { profile, isAdminOrAbove } = useAuth();
  const { tasks, myTasks, profileById, loading } = useTasks(profile);
  const { categoryById, categories } = useCategories();

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const source = isAdminOrAbove ? tasks : myTasks;

  const filtered = useMemo(() => {
    return source.filter((t: Task) => {
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'none' ? !!t.category_id : t.category_id !== categoryFilter)
          return false;
      }
      if (statusFilter !== 'all' && effectiveStatus(t) !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const names = (t.assignee_ids ?? [])
          .map((id) => profileById.get(id)?.full_name?.toLowerCase() ?? '')
          .join(' ');
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.description ?? '').toLowerCase().includes(q) &&
          !names.includes(q)
        )
          return false;
      }
      return true;
    });
  }, [source, categoryFilter, statusFilter, query, profileById]);

  if (!profile) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FolderTree size={24} className="text-blue-600" /> Task Management
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isAdminOrAbove
            ? 'Repository of all tasks for reuse and global maintenance. Use “My Tasks” to create or edit individual tasks.'
            : 'Read-only archive of tasks assigned to you. Editing is handled by your admin.'}
        </p>
      </div>

      {!isAdminOrAbove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 flex items-center gap-2 text-blue-700 text-sm">
          <ShieldAlert size={16} />
          Assigned tasks cannot be edited or deleted by assignees — this view is for reference only.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, assignee…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none capitalize focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
          <option value="completed">Complete</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CalendarDays size={40} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No tasks match your filters</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((task) => {
              const daysLabel =
                task.frequency === 'daily' ? formatWeekdays(task.weekdays) : null;
              return (
                <li key={task.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`font-semibold text-gray-800 ${
                            effectiveStatus(task) === 'completed'
                              ? 'line-through text-gray-400'
                              : ''
                          }`}
                        >
                          {task.title}
                        </p>
                        <StatusBadge task={task} />
                        <CategoryBadge category={categoryById.get(task.category_id ?? '')} />
                        <FrequencyBadge task={task} />
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Due{' '}
                          {formatDueDate(task.next_due_date ?? task.due_date)}
                        </span>
                        {daysLabel && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={12} /> Every {daysLabel}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {(task.assignee_ids ?? [])
                            .map((id) => {
                              const p: Profile | undefined = profileById.get(id);
                              return p
                                ? `${p.full_name} (${ROLE_LABELS[p.role]})`
                                : 'Unknown';
                            })
                            .join(', ')}
                        </span>
                        {task.occurrence_count > 1 && (
                          <span>Occurrence #{task.occurrence_count}</span>
                        )}
                      </p>
                      <TaskLinks links={task.links} />
                    </div>
                    <p className="text-[11px] text-gray-400 flex-shrink-0">
                      Created {formatDueDate(task.created_at ?? null)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Showing {filtered.length} of {source.length}{' '}
        {isAdminOrAbove ? 'tasks in the repository' : 'assigned tasks'}.
      </p>
    </div>
  );
}
