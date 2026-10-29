import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, AlertTriangle, FolderTree, Search, X, FolderOpen } from 'lucide-react';
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
 * Task Management — the SUPER ADMIN area for ORGANIZATION tasks (global edit
 * and reuse). Admins & Super Admins can create/edit/delete any task here;
 * standard users get a read-only view. Overdue items float to the top.
 * Status cards + frequency buttons combine (e.g. Pending + Daily).
 *
 * Personal tasks & personal categories are NEVER listed or counted here —
 * they belong exclusively to their owner (see useTasks / RLS in schema.sql).
 */
export default function TaskManagement() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [searchParams, setSearchParams] = useSearchParams();

  /** Folder Categories → clicking a category opens this view pre-filtered
   *  via ?category=<id>&name=<display name>. The URL param is the single
   *  source of truth so the "Filter by Task Category" dropdown and the folder
   *  banner always stay in sync. */
  const categoryFilterId = searchParams.get('category');
  const categoryFilterName = searchParams.get('name') ?? 'this category';

  function setCategoryFilter(id: string) {
    const next = new URLSearchParams(searchParams);
    if (!id) {
      next.delete('category');
      next.delete('name');
    } else {
      const cat = t.categories.find((c) => c.id === id);
      next.set('category', id);
      next.set('name', cat?.name ?? 'this category');
    }
    setSearchParams(next, { replace: true });
  }

  function clearCategoryFilter() {
    setCategoryFilter('');
  }

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
    // SUPER ADMIN repository = ORGANIZATION tasks ONLY. Personal tasks are
    // private to their owner and never listed or counted here.
    let items = t.orgTasks;
    if (categoryFilterId) items = items.filter((x) => x.category_id === categoryFilterId);
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
  }, [t.orgTasks, t.statusOf, filter, freqs, q, categoryFilterId]);

  /** Per-frequency counts within the currently selected status card. */
  const freqCounts = useMemo(() => {
    const baseRaw = categoryFilterId
      ? t.orgTasks.filter((x) => x.category_id === categoryFilterId)
      : t.orgTasks;
    const base = filter === 'all' ? baseRaw : baseRaw.filter((x) => t.statusOf(x) === filter);
    const map: Partial<Record<TaskFrequency, number>> = {};
    base.forEach((x) => {
      map[x.frequency] = (map[x.frequency] ?? 0) + 1;
    });
    return map;
  }, [t.orgTasks, t.statusOf, filter, freqs, categoryFilterId]);

  /** Options for the "Filter by Task Category" dropdown — ALL categories that
   *  exist now or may appear later: every organization category (present),
   *  plus any category still attached to a stored task (upcoming/legacy), so
   *  brand-new categories created anywhere show up automatically. Includes
   *  the user's own personal categories and shows each one's task count. */
  const categoryOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; color: string | null }>();
    t.categories.forEach((c) => byId.set(c.id, { id: c.id, name: c.name, color: c.color }));
    // Categories referenced by tasks but missing from the list (edge case).
    t.tasks.forEach((x) => {
      if (x.category_id && x.category?.name && !byId.has(x.category_id)) {
        byId.set(x.category_id, { id: x.category_id, name: x.category.name, color: null });
      }
    });
    const opts = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    return opts.map((o) => ({ ...o, count: t.tasks.filter((x) => x.category_id === o.id).length }));
  }, [t.categories, t.tasks]);

  const filtersActive = filter !== 'all' || freqs.length > 0 || !!categoryFilterId;

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
            All ORGANIZATION tasks ever created — the office repository for reuse and global
            editing. Personal tasks are private to their owner and never appear here.
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
              title="Create an official ORGANIZATION task (counted system-wide)"
            >
              <Plus size={15} /> New Task
            </button>
          )}
        </div>
      </div>

      {!isAdminOrAbove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
          Read-only repository view of organization tasks. Only Admins and Super Admins can edit or
          delete tasks globally.
        </div>
      )}

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      {/* Category ("folder") view banner — set from Folder Categories clicks */}
      {categoryFilterId && (
        <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
          <FolderOpen size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-blue-800 break-words min-w-0">
            Tasks in category: {categoryFilterName}
          </span>
          <span className="text-xs text-blue-600">{list.length} task(s)</span>
          <button
            onClick={clearCategoryFilter}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <X size={12} /> Show all categories
          </button>
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
              clearCategoryFilter();
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
          {list.map((task) => {
            // Repository view: Admins may edit/delete ONLY the tasks they
            // created/assigned; Super Admins keep full global control.
            const mine = task.assigned_by === profile?.id;
            const canManage = isAdminOrAbove && (profile?.role === 'SUPER_ADMIN' || mine);
            // Complete button → assignees only; Super Admins may complete ANY
            // task even when not assigned. Unassigned users get NO button.
            const assignedToMe =
              task.assigned_to === profile.id || (task.assignees ?? []).includes(profile.id);
            // Outstanding (uncertified) assignees when the task is past due →
            // shown as a clickable red "OVERDUE +N" chip beside the names.
            const overdueCount = (() => {
              if (t.statusOf(task) !== 'overdue') return 0;
              const rows =
                task.assignments && task.assignments.length > 0
                  ? task.assignments
                  : (task.assignees ?? [task.assigned_to]).map((u) => ({
                      task_id: task.id,
                      user_id: u ?? '',
                      completed: false,
                    }));
              return rows.filter((a) => a.user_id && !a.completed).length;
            })();
            return (
              <TaskCard
                key={task.id}
                task={task}
                status={t.statusOf(task)}
                canManage={canManage}
                canComplete={profile?.role === 'SUPER_ADMIN' ? true : assignedToMe}
                myDone={t.myAssignmentDone(task)}
                overdueCount={overdueCount}
                onComplete={async (id, note) => t.completeTask(id, { acknowledged: true, note })}
                onReopen={t.reopenTask}
                onEdit={
                  canManage
                    ? (tk) => {
                        setEditing(tk);
                        setModalOpen(true);
                      }
                    : undefined
                }
                onDelete={
                  canManage
                    ? async (tk) => {
                        if (window.confirm(`Delete “${tk.title}” from the repository?`)) {
                          await t.deleteTask(tk.id);
                        }
                      }
                    : undefined
                }
              />
            );
          })}
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
        canEditDetails={isAdminOrAbove}
        role={profile?.role}
        currentUserId={profile?.id}
        /* SUPER ADMIN area → adding a task here creates an ORGANIZATION task,
           never a personal one (personal tasks live in "My Tasks"). */
        defaultPersonal={false}
        orgCategoriesOnly
      />
    </div>
  );
}
