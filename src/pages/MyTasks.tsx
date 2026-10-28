import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { friendlyDbError } from '../lib/dbErrors';
import StatsCards, { StatFilter } from '../components/StatsCards';
import TaskCard from '../components/TaskCard';
import TaskFormModal from '../components/TaskFormModal';
import type { Task } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * My Tasks — tasks assigned to the current user (any of the assignees).
 * Assigned users may ONLY complete a task (with the liability notice);
 * editing/deleting is disabled for them and enabled for Admins/Superadmin.
 */
export default function MyTasks() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [filter, setFilter] = useState<StatFilter>('all');
  const [statusTask, setStatusTask] = useState<Task | null>(null);

  const list = useMemo(() => {
    let items = t.myTasks;
    if (filter !== 'all') items = items.filter((x) => t.statusOf(x) === filter);
    return items;
  }, [t.myTasks, t.statusOf, filter]);

  if (t.loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Tasks</h1>
          <p className="text-sm text-gray-500">
            Everything assigned to you. Click “Complete Task” and certify honestly — you are held
            responsible and liable for false completion.
          </p>
        </div>
        <button
          onClick={t.refetch}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      {!isAdminOrAbove && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4 text-xs text-gray-600">
          <Lock size={14} className="mt-0.5 flex-shrink-0" />
          Assigned staff cannot edit or delete their tasks. Use the Complete button after
          acknowledging responsibility, or contact your Admin for corrections.
        </div>
      )}

      <StatsCards stats={t.stats.mine} active={filter} onSelect={setFilter} />

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <p className="text-gray-500 font-medium">
            {filter !== 'all' ? 'No tasks match this filter.' : 'You have no assigned tasks. 🎉'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              status={t.statusOf(task)}
              canManage={isAdminOrAbove}
              onComplete={async (id, note) => t.completeTask(id, { acknowledged: true, note })}
              onReopen={t.reopenTask}
              onEdit={
                isAdminOrAbove
                  ? (tk) => {
                      setStatusTask(tk);
                    }
                  : undefined
              }
              onDelete={
                isAdminOrAbove
                  ? async (tk) => {
                      if (window.confirm(`Delete “${tk.title}”?`)) await t.deleteTask(tk.id);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Status-only modal for non-admins is handled inline in TaskCard;
          admins get the full editor here via Task Management. */}
      <TaskFormModal
        open={!!statusTask && isAdminOrAbove}
        onClose={() => setStatusTask(null)}
        task={statusTask}
        categories={t.categories}
        profiles={t.profiles}
        canEditDetails={isAdminOrAbove}
        onSubmit={async (draft) => {
          if (!statusTask) return { error: 'No task selected.' };
          return t.updateTask(statusTask.id, {
            title: draft.title,
            description: draft.description || null,
            due_date: draft.due_date ? new Date(`${draft.due_date}T09:00:00`).toISOString() : null,
            frequency: draft.frequency as Task['frequency'],
            days_of_week: draft.days_of_week,
            repeat_forever: draft.repeat_forever,
            category_id: draft.category_id || null,
            assignees: draft.assignees,
            links: draft.links,
            status: draft.status,
          });
        }}
        onCategoryCreated={() => t.refetch()}
      />
    </div>
  );
}
