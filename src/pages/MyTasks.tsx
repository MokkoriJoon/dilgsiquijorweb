import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  RefreshCw,
  AlertTriangle,
  Lock,
  X,
  Plus,
  User,
  Users,
  Inbox,
  ShieldAlert,
  Globe,
} from 'lucide-react';
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

/** Filter a task list by the active status card + frequency buttons. */
function applyFilters(
  items: Task[],
  filter: StatFilter,
  freqs: TaskFrequency[],
  statusOf: (t: Task) => 'pending' | 'completed' | 'overdue',
) {
  if (filter !== 'all') items = items.filter((x) => statusOf(x) === filter);
  if (freqs.length > 0) items = items.filter((x) => freqs.includes(x.frequency));
  return items;
}

/** Per-frequency counts within the currently selected status card. */
function freqCountMap(
  items: Task[],
  filter: StatFilter,
  statusOf: (t: Task) => 'pending' | 'completed' | 'overdue',
) {
  const base = filter === 'all' ? items : items.filter((x) => statusOf(x) === filter);
  const map: Partial<Record<TaskFrequency, number>> = {};
  base.forEach((x) => {
    map[x.frequency] = (map[x.frequency] ?? 0) + 1;
  });
  return map;
}

/**
 * My Tasks — two clearly separated areas:
 *
 *  1. ASSIGNED TASKS — everything an Admin/Super Admin assigned to me.
 *     Only the assigned user(s) can complete these (with the liability notice);
 *     editing/deleting stays with Admins/Super Admins. Standard users get NO
 *     "New Task" button here — they cannot create tasks for the system.
 *  2. PERSONAL TASKS — private to-do items I create for MYSELF. They are only
 *     visible to me and are NEVER counted in the organization-wide totals
 *     (public board, dashboards, statistics). Everyone can add personal tasks.
 */
export default function MyTasks() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);

  // Assigned-tasks filters
  const [filter, setFilter] = useState<StatFilter>('all');
  const [freqs, setFreqs] = useState<TaskFrequency[]>([]);

  // Personal-tasks filters (independent of the assigned ones)
  const [pFilter, setPFilter] = useState<StatFilter>('all');
  const [pFreqs, setPFreqs] = useState<TaskFrequency[]>([]);

  /** Task opened in the editor/status modal. */
  const [statusTask, setStatusTask] = useState<Task | null>(null);
  /** Create-task modal (Personal Tasks section / admins on assigned lists). */
  const [createOpen, setCreateOpen] = useState(false);
  /** Whether the create modal is in personal-task mode. */
  const [createPersonal, setCreatePersonal] = useState(true);

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

  function handlePersonalCardSelect(f: StatFilter) {
    if (f === pFilter) {
      setPFilter('all');
      setPFreqs([]);
    } else {
      setPFilter(f);
    }
  }

  function togglePFreq(f: TaskFrequency) {
    setPFreqs((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const assignedList = useMemo(
    () => applyFilters(t.assignedTasks, filter, freqs, t.statusOf),
    [t.assignedTasks, t.statusOf, filter, freqs],
  );
  const personalList = useMemo(
    () => applyFilters(t.personalTasks, pFilter, pFreqs, t.statusOf),
    [t.personalTasks, t.statusOf, pFilter, pFreqs],
  );

  const freqCounts = useMemo(
    () => freqCountMap(t.assignedTasks, filter, t.statusOf),
    [t.assignedTasks, t.statusOf, filter],
  );
  const personalFreqCounts = useMemo(
    () => freqCountMap(t.personalTasks, pFilter, t.statusOf),
    [t.personalTasks, t.statusOf, pFilter],
  );

  const filtersActive = filter !== 'all' || freqs.length > 0;
  const personalFiltersActive = pFilter !== 'all' || pFreqs.length > 0;

  function openCreate(personal: boolean) {
    setCreatePersonal(personal);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(draft: Parameters<typeof draftToPayload>[0]) {
    const payload = draftToPayload(draft);
    return t.createTask(payload);
  }

  async function handleEditSubmit(draft: Parameters<typeof draftToPayload>[0]) {
    if (!statusTask) return { error: 'No task selected.' };
    return t.updateTask(statusTask.id, draftToPayload(draft));
  }

  /** Render one task row with the correct permissions for its type. */
  function renderCard(task: Task, personal: boolean) {
    // Personal tasks are always fully manageable by their owner. For ASSIGNED
    // organization tasks even Admins may only edit/delete what THEY created —
    // a task merely assigned to them is read-only (complete only). Standard
    // users never get edit/delete on assigned tasks at all.
    const canManage = personal || (isAdminOrAbove && task.assigned_by === profile.id);
    // Complete button: assignees only — except Super Admins, who may complete
    // ANY task even when not assigned. Unassigned Admins/Standard see nothing.
    const assignedToMe =
      task.assigned_to === profile.id || (task.assignees ?? []).includes(profile.id);
    const canComplete = profile.role === 'SUPER_ADMIN' ? true : assignedToMe;
    return (
      <TaskCard
        key={task.id}
        task={task}
        status={t.statusOf(task)}
        canManage={canManage}
        canComplete={canComplete}
        myDone={!personal && t.myAssignmentDone(task)}
        onComplete={async (id, note) => t.completeTask(id, { acknowledged: true, note })}
        onReopen={canManage ? t.reopenTask : undefined}
        onEdit={
          canManage
            ? (tk) => {
                setStatusTask(tk);
              }
            : undefined
        }
        onDelete={
          canManage
            ? async (tk) => {
                if (window.confirm(`Delete “${tk.title}”?`)) await t.deleteTask(tk.id);
              }
            : undefined
        }
      />
    );
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
          <h1 className="text-2xl font-bold text-gray-800">My Tasks</h1>
          <p className="text-sm text-gray-500">
            Everything assigned to you. Click “Complete Task” and certify honestly — you are held
            responsible and liable for false completion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={t.refetch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {/* Public Viewing Dashboard — opens the live org-wide board while the
              user stays logged in (the page shows a "Back to my account" button). */}
          <Link
            to="/?view=public"
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 text-sm font-medium"
            title="Open the Public Viewing Dashboard (you stay signed in)"
          >
            <Globe size={14} /> Public View Dashboard
          </Link>
          {/* Personal tasks: allowed for EVERY role (private, not system-wide).
              NOTE: the top "+Add New Personal Task" button was removed — personal
              tasks are added from the Personal Tasks section below. */}
          {/* Organization/system tasks: Admins & Super Admins ONLY. */}
          {isAdminOrAbove && (
            <button
              onClick={() => openCreate(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium"
              title="Create and assign an official task for the organization"
            >
              <Plus size={15} /> New Task
            </button>
          )}
        </div>
      </div>

      {t.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {friendlyDbError(t.error)}
        </div>
      )}

      {!isAdminOrAbove && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4 text-xs text-gray-600">
          <Lock size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Standard user:</strong> you cannot create or assign tasks for the system or the
            organization — only Admins and Super Admins can do that. You may still add{' '}
            <strong>Personal Tasks</strong> below (visible only to you and never counted in the
            whole system), and you can complete the tasks assigned to you. Assigned staff cannot
            edit or delete those tasks; contact your Admin for corrections.
          </span>
        </div>
      )}

      {/* ════════════════ 1 · ASSIGNED TASKS (organization) ════════════════ */}
      <section className="mb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <Users size={17} className="text-blue-600" />
            Assigned Tasks
            <span className="rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5">
              {t.stats.mine.total}
            </span>
          </h2>
          <p className="text-xs text-gray-500">
            Official tasks assigned to you — counted in the organization’s totals.
          </p>
        </div>

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

        {assignedList.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
            <p className="text-gray-500 font-medium">
              {filtersActive
                ? 'No assigned tasks match this filter.'
                : 'You have no assigned tasks. 🎉'}
            </p>
            {filtersActive && (
              <p className="text-sm text-gray-400 mt-1">
                Click the active card again — or “Reset all filters” — to clear them.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">{assignedList.map((task) => renderCard(task, false))}</div>
        )}
      </section>

      {/* ════════════════ 2 · PERSONAL TASKS (private) ════════════════ */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <User size={17} className="text-violet-600" />
            Personal Tasks
            <span className="rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold px-2 py-0.5">
              {t.stats.personal.total}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              <ShieldAlert size={11} /> Private · not counted in the system
            </span>
          </h2>
          <button
            onClick={() => openCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700 px-3 py-1.5 text-sm font-medium"
          >
            <Plus size={14} /> Add New Personal Task
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 mb-4 text-xs text-violet-800">
          <Inbox size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Your own to-do list. These tasks are <strong>only viewable by you</strong> and are{' '}
            <strong>not counted anywhere in the organization</strong> — not on the public board,
            dashboards, statistics or reports. You may freely create, edit and delete them.
          </span>
        </div>

        <StatsCards stats={t.stats.personal} active={pFilter} onSelect={handlePersonalCardSelect} />

        <FrequencyFilter
          active={pFreqs}
          counts={personalFreqCounts}
          onToggle={togglePFreq}
          onClear={() => setPFreqs([])}
        />

        {personalFiltersActive && (
          <div className="flex flex-wrap items-center gap-2 mb-4 -mt-2">
            <span className="text-xs text-gray-500">Active filters:</span>
            {pFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                {pFilter}
                <button onClick={() => setPFilter('all')} title="Remove status filter">
                  <X size={11} />
                </button>
              </span>
            )}
            {pFreqs.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-[11px] font-semibold capitalize"
              >
                {f}
                <button onClick={() => togglePFreq(f)} title={`Remove ${f} filter`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setPFilter('all');
                setPFreqs([]);
              }}
              className="text-[11px] font-semibold text-red-600 hover:underline ml-1"
            >
              Reset all filters
            </button>
          </div>
        )}

        {personalList.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
            <p className="text-gray-500 font-medium">
              {personalFiltersActive
                ? 'No personal tasks match this filter.'
                : 'No personal tasks yet.'}
            </p>
            {!personalFiltersActive && (
              <p className="text-sm text-gray-400 mt-1">
                Use “Add New Personal Task” above to keep private reminders for yourself.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">{personalList.map((task) => renderCard(task, true))}</div>
        )}
      </section>

      {/* Create modal — personal mode for everyone, org mode for admins only. */}
      <TaskFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        task={null}
        categories={t.categoriesForTasks}
        profiles={t.profiles}
        role={profile.role}
        currentUserId={profile.id}
        defaultPersonal={createPersonal}
        lockPersonal={createPersonal}
        canEditDetails
        onSubmit={handleCreateSubmit}
        onCategoryCreated={() => t.refetch()}
      />

      {/* Edit / status modal. Personal tasks → owner can edit everything;
          assigned organization tasks → full editor for admins only. */}
      <TaskFormModal
        open={!!statusTask}
        onClose={() => setStatusTask(null)}
        task={statusTask}
        categories={t.categoriesForTasks}
        profiles={t.profiles}
        role={profile.role}
        currentUserId={profile.id}
        lockPersonal={!!statusTask?.is_personal}
        canEditDetails={!!statusTask && (statusTask.is_personal || isAdminOrAbove)}
        onSubmit={handleEditSubmit}
        onCategoryCreated={() => t.refetch()}
      />
    </div>
  );
}
