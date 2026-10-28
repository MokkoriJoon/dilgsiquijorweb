import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, RefreshCw, AlertTriangle, FolderTree, Search, X } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { friendlyDbError } from '../lib/dbErrors';
import StatsCards, { StatFilter } from '../components/StatsCards';
import FrequencyFilter from '../components/FrequencyFilter';
import TaskCard from '../components/TaskCard';
import TaskFormModal from '../components/TaskFormModal';
import { draftToPayload } from './dashboardShared';
import type { Task, TaskFrequency } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Task Management — the global repository of ALL tasks (for reusability and
 * global edit). Admins & Super Admins can create/edit/delete any task here;
 * standard users get a read-only view. Overdue items float to the top.
 * Status cards + frequency buttons combine (e.g. Pending + Daily).
 */
export default function TaskManagement() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [filter, setFilter] = useState<StatFilter>('all');
  const [freqs, setFreqs] = useState<TaskFrequency[]>([]);
  const [q, setQ] = useState('');
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
    let items = t.tasks; // every visible task = the repository
    if (filter !== 'all') items = items.filter((x) => t.statusOf(x) === filter);
    if (freqs.length > 0) items = items.filter((x) => freqs.includes(x.frequency));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      items = items.filter(
        (x) =>
          x.title.toLowerCase().includes(needle) ||
          (x.description ?? '').toLowerCase().includes(needle) ||
          (x.category?.name ?? '').toLowerCase().includes(needle),
      );
    }
    return items;
  }, [t.tasks, t.statusOf, filter, freqs, q]);

  /** Per-frequency counts within the currently selected status card. */
  const freqCounts = useMemo(() => {
    const base = filter === 'all' ? t.tasks : t.tasks.filter((x) => t.statusOf(x) === filter);
    const map: Partial<Record<TaskFrequency, number>> = {};
    base.forEach((x) => {
      map[x.frequency] = (map[x.frequency] ?? 0) + 1;
    });
    return map;
  }, [t.tasks, t.statusOf, filter]);

  const filtersActive = filter !== 'all' || freqs.length > 0;

  async function handleSubmit(draft: Parameters<typeof draftToPayload>[0]) {
    const payload = draftToPayload(draft);
    if (editing) return t.updateTask(editing.id, payload);
    return t.createTask(payload);
  }

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
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FolderTree size={22} className="text-blue-600" />
            Task Management
          </h1>
          <p className="text-sm text-gray-500">
            All tasks ever created — the office repository for reuse and global editing.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={t.refetch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isAdminOrAbove && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium"
            >
              <Plus size={15} /> New Task
            </button>
          )}
        </div>
      </div>

      {!isAdminOrAbove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
          Read-only repository view. Only Admins and Super Admins can edit or delete tasks globally.
        </div>
      )}

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      <StatsCards stats={t.stats.all} active={filter} onSelect={handleCardSelect} />

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

      <div className="relative mb-4 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, description or category…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <p className="text-gray-500 font-medium">No tasks match this view.</p>
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
                      setEditing(tk);
                      setModalOpen(true);
                    }
                  : undefined
              }
              onDelete={
                isAdminOrAbove
                  ? async (tk) => {
                      if (window.confirm(`Delete “${tk.title}” from the repository?`)) {
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
        canEditDetails={isAdminOrAbove}
      />
    </div>
  );
}
