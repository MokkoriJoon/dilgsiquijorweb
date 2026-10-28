import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react';
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
          ? 'Click the active card again to reset the filter.'
          : 'Assigned tasks will appear here.'}
      </p>
    </div>
  );
}

/**
 * Personal Dashboard — the logged-in user's own assigned tasks.
 * Cards are clickable to filter (All / Pending / Complete / Overdue).
 */
export default function AppDashboard() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [filter, setFilter] = useState<StatFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const list = useMemo(() => {
    let items = t.myTasks;
    if (filter !== 'all') items = items.filter((x) => t.statusOf(x) === filter);
    return items;
  }, [t.myTasks, t.statusOf, filter]);

  async function handleSubmit(draft: Parameters<typeof draftToPayload>[0]) {
    const payload = draftToPayload(draft);
    if (editing) return t.updateTask(editing.id, payload);
    return t.createTask(payload);
  }

  if (t.loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Dashboard</h1>
          <p className="text-sm text-gray-500">
            Tasks assigned to you — click a card to filter the list.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={t.refetch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium"
          >
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      <StatsCards stats={t.stats.mine} active={filter} onSelect={setFilter} />

      {list.length === 0 ? (
        <EmptyState filtered={filter !== 'all'} />
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
              onEdit={(tk) => {
                setEditing(tk);
                setModalOpen(true);
              }}
              onDelete={
                isAdminOrAbove
                  ? async (tk) => {
                      if (window.confirm(`Delete “${tk.title}”? This cannot be undone.`)) {
                        await t.deleteTask(tk.id);
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
        categories={t.categories}
        profiles={t.profiles}
        onSubmit={handleSubmit}
        onCategoryCreated={() => t.refetch()}
        canEditDetails
      />
    </div>
  );
}
