import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { friendlyDbError } from '../lib/dbErrors';
import StatsCards, { StatFilter } from '../components/StatsCards';
import FrequencyFilter from '../components/FrequencyFilter';
import TaskCard from '../components/TaskCard';
import TaskFormModal from '../components/TaskFormModal';
import { draftToPayload, Spinner, EmptyState } from './dashboardShared';
import type { Task, TaskFrequency } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Personal Dashboard — the logged-in user's own assigned tasks.
 *  • Cards filter by status (All / Pending / Complete / Overdue).
 *  • Frequency buttons under the cards combine WITH the status card:
 *      Pending + Daily   → only pending daily tasks.
 *      Overdue + Monthly → only overdue monthly tasks.
 *  • Clicking the active card again resets ALL filters (fixed reset).
 *  • NO "+ New Task" button here for any role — creating organization tasks
 *    lives in SUPER ADMIN areas (Task Management) and personal task creation
 *    lives in "My Tasks". This dashboard also never counts or lists other
 *    users' PERSONAL tasks/categories (RLS + client-side filtering).
 */
export default function AppDashboard() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [filter, setFilter] = useState<StatFilter>('all');
  const [freqs, setFreqs] = useState<TaskFrequency[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  /** Clicking the already-active card resets BOTH status and frequency. */
  function handleCardSelect(f: StatFilter) {
    if (f === filter) {
      setFilter('all');
      setFreqs([]);
    } else {
      setFilter(f);
    }
  }

  function toggleFreq(f: TaskFrequency) {
    setFreqs((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const list = useMemo(() => {
    let items = t.myTasks;
    if (filter !== 'all') items = items.filter((x) => t.statusOf(x) === filter);
    if (freqs.length > 0) items = items.filter((x) => freqs.includes(x.frequency));
    return items;
  }, [t.myTasks, t.statusOf, filter, freqs]);

  /** Per-frequency counts within the currently selected status card. */
  const freqCounts = useMemo(() => {
    const base =
      filter === 'all' ? t.myTasks : t.myTasks.filter((x) => t.statusOf(x) === filter);
    const map: Partial<Record<TaskFrequency, number>> = {};
    base.forEach((x) => {
      map[x.frequency] = (map[x.frequency] ?? 0) + 1;
    });
    return map;
  }, [t.myTasks, t.statusOf, filter]);

  const filtersActive = filter !== 'all' || freqs.length > 0;

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
            Tasks assigned to you — click a card to filter, then narrow further with the frequency
            buttons below. Both filters work together.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={t.refetch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {/* "+ New Task" intentionally REMOVED for every role — personal task
              creation happens in "My Tasks"; organization tasks are created by
              Super Admins in Task Management. */}
        </div>
      </div>

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      <StatsCards stats={t.stats.mine} active={filter} onSelect={handleCardSelect} />

      <FrequencyFilter
        active={freqs}
        counts={freqCounts}
        onToggle={toggleFreq}
        onClear={() => setFreqs([])}
      />

      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2 mb-4 -mt-2">
          <span className="text-xs text-gray-500">Active filters:</span>
          {filter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[11px] font-semibold capitalize">
              {filter}
              <button onClick={() => setFilter('all')} title="Remove status filter">
                <X size={11} />
              </button>
            </span>
          )}
          {freqs.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-[11px] font-semibold capitalize"
            >
              {f}
              <button onClick={() => toggleFreq(f)} title={`Remove ${f} filter`}>
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            onClick={() => {
              setFilter('all');
              setFreqs([]);
            }}
            className="text-[11px] font-semibold text-red-600 hover:underline ml-1"
          >
            Reset all filters
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState filtered={filtersActive} />
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
        categories={t.categoriesForTasks}
        profiles={t.profiles}
        onSubmit={handleSubmit}
        onCategoryCreated={() => t.refetch()}
        canEditDetails
      />
    </div>
  );
}

// Re-export shared helpers so existing imports keep working.
export { draftToPayload, Spinner, EmptyState };
