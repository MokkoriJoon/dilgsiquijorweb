import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Folder, ChevronRight, Tags, Search, X, FolderOpen } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { colorNameFor } from '../lib/categoryColors';
import { toTitleCase } from '../lib/case';
import TaskCard from '../components/TaskCard';
import TaskFormModal from '../components/TaskFormModal';
import { draftToPayload } from './dashboardShared';
import type { Task, TaskFrequency } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

interface SelectedFolder {
  id: string;
  name: string;
  personal: boolean;
}

const FREQUENCIES: TaskFrequency[] = [
  'one-time',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semester',
  'yearly',
];

/**
 * Folder Categories — open a category in place and browse its tasks without
 * sending users to Task Management or My Tasks.
 */
export default function FolderCategories() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [selected, setSelected] = useState<SelectedFolder | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState<TaskFrequency | ''>('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'overdue' | 'completed' | ''>('');
  const [editing, setEditing] = useState<Task | null>(null);

  const folders = [
    ...t.orgCategories.map((cat) => ({ cat, personal: false })),
    ...t.personalCategories.map((cat) => ({ cat, personal: true })),
  ];

  const folderTasks = useMemo(() => {
    if (!selected) return [];
    const source = selected.personal ? t.personalTasks : t.orgTasks;
    const needle = nameFilter.trim().toLocaleLowerCase();
    return source.filter((task) => {
      if (task.category_id !== selected.id) return false;
      if (needle && !task.title.toLocaleLowerCase().includes(needle)) return false;
      if (frequencyFilter && task.frequency !== frequencyFilter) return false;
      if (statusFilter && t.statusOf(task) !== statusFilter) return false;
      return true;
    });
  }, [selected, t.personalTasks, t.orgTasks, t.statusOf, nameFilter, frequencyFilter, statusFilter]);

  function openFolder(id: string, name: string, personal: boolean) {
    setSelected({ id, name, personal });
    setNameFilter('');
    setFrequencyFilter('');
    setStatusFilter('');
  }

  function clearFilters() {
    setNameFilter('');
    setFrequencyFilter('');
    setStatusFilter('');
  }

  async function handleSubmit(draft: Parameters<typeof draftToPayload>[0]) {
    if (!editing) return { error: 'No task selected.' };
    return t.updateTask(editing.id, draftToPayload(draft));
  }

  function renderTask(task: Task, personal: boolean) {
    const mine = task.assigned_by === profile.id;
    const canManage = personal || (isAdminOrAbove && (profile.role === 'SUPER_ADMIN' || mine));
    const assignedToMe = task.assigned_to === profile.id || (task.assignees ?? []).includes(profile.id);
    const status = t.statusOf(task);
    const overdueCount =
      status === 'overdue'
        ? (task.assignments ?? []).filter((assignment) => assignment.user_id && !assignment.completed)
            .length
        : 0;

    return (
      <TaskCard
        key={task.id}
        task={task}
        status={status}
        canManage={canManage}
        canComplete={profile.role === 'SUPER_ADMIN' || assignedToMe}
        myDone={!personal && t.myAssignmentDone(task)}
        overdueCount={overdueCount}
        onComplete={async (id, note) => t.completeTask(id, { acknowledged: true, note })}
        onReopen={canManage ? t.reopenTask : undefined}
        onEdit={canManage ? setEditing : undefined}
        onDelete={
          canManage
            ? async (selectedTask) => {
                if (window.confirm(`Delete “${selectedTask.title}”?`)) {
                  await t.deleteTask(selectedTask.id);
                }
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

  function folderButton(cat: (typeof folders)[number]['cat'], personal: boolean) {
    const count = t.categoryTaskCount.get(cat.id) ?? 0;
    const color = cat.color ?? '#64748b';
    const active = selected?.id === cat.id;
    return (
      <button
        key={cat.id}
        type="button"
        onClick={() => openFolder(cat.id, cat.name, personal)}
        aria-pressed={active}
        className={`group w-full text-left bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all ${
          personal
            ? active
              ? 'border-violet-400 ring-2 ring-violet-100'
              : 'border-violet-100 hover:border-violet-300'
            : active
              ? 'border-blue-400 ring-2 ring-blue-100'
              : 'border-gray-100 hover:border-blue-300'
        }`}
        title={`View all ${count} task(s) in “${toTitleCase(cat.name)}”`}
      >
        <span
          className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Folder size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block font-semibold text-gray-800 truncate ${
              personal ? 'group-hover:text-violet-700' : 'group-hover:text-blue-700'
            }`}
          >
            {toTitleCase(cat.name)}
          </span>
          <span className="block text-[11px] text-gray-400 mt-0.5">
            {count} {personal ? 'personal task(s) · Private' : `task(s) · ${colorNameFor(color)}`}
          </span>
        </span>
        <ChevronRight
          size={16}
          className={`flex-shrink-0 ${
            personal
              ? 'text-gray-300 group-hover:text-violet-500'
              : 'text-gray-300 group-hover:text-blue-500'
          }`}
        />
      </button>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Folder size={24} className="text-amber-500" /> Folder Categories
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every category is a folder. Select one to view all tasks in this page.
        </p>
      </div>

      {folders.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <p className="text-gray-500 font-medium">No categories yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Admins can create categories in “Task Categories”; you can also add personal ones there.
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Tags size={14} className="text-blue-600" /> Organization Categories
            <span className="rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5 normal-case">
              {t.orgCategories.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {t.orgCategories.map((cat) => folderButton(cat, false))}
            {t.orgCategories.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">No organization categories yet.</p>
            )}
          </div>

          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Folder size={14} className="text-violet-600" /> My Personal Folders
            <span className="rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold px-2 py-0.5 normal-case">
              {t.personalCategories.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {t.personalCategories.map((cat) => folderButton(cat, true))}
            {t.personalCategories.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">
                No personal categories yet — create one in “Task Categories”.
              </p>
            )}
          </div>
        </>
      )}

      {selected && (
        <section className="mt-8" aria-labelledby="selected-category-title">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={19} className="text-blue-600 flex-shrink-0" />
              <h2 id="selected-category-title" className="text-lg font-bold text-gray-800 truncate">
                {toTitleCase(selected.name)}
              </h2>
              <span className="text-xs text-gray-500">{folderTasks.length} task(s)</span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <X size={13} /> Close folder
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <label className="text-xs font-medium text-gray-600">
              Name
              <span className="relative block mt-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Search task name..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </span>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Frequency
              <select
                value={frequencyFilter}
                onChange={(event) => setFrequencyFilter(event.target.value as TaskFrequency | '')}
                className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">All frequencies</option>
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency === 'one-time'
                      ? 'One-time'
                      : `${frequency.charAt(0).toUpperCase()}${frequency.slice(1)}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'pending' | 'overdue' | 'completed' | '')
                }
                className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            {(nameFilter || frequencyFilter || statusFilter) && (
              <button
                type="button"
                onClick={clearFilters}
                className="sm:col-span-3 justify-self-start text-xs font-semibold text-blue-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {folderTasks.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
              <p className="text-gray-500 font-medium">No tasks match these filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {folderTasks.map((task) => renderTask(task, selected.personal))}
            </div>
          )}
        </section>
      )}

      <TaskFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        task={editing}
        categories={t.categoriesForTasks}
        profiles={t.profiles}
        onSubmit={handleSubmit}
        onCategoryCreated={t.refetch}
        canEditDetails={isAdminOrAbove || !!editing?.is_personal}
        role={profile.role}
        currentUserId={profile.id}
        defaultPersonal={!!editing?.is_personal}
        orgCategoriesOnly={false}
      />
    </div>
  );
}
