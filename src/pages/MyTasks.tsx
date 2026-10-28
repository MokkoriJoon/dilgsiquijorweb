import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useTasks, formatDueDate } from '../lib/useTasks';
import { useCategories } from '../lib/useCategories';
import type { Profile, ResourceLink, Task, TaskFrequency } from '../lib/types';
import { ROLE_LABELS } from '../lib/types';
import { effectiveStatus, formatWeekdays } from '../lib/recurrence';
import { StatusBadge, CategoryBadge, FrequencyBadge, TaskLinks } from '../components/TaskBadges';
import {
  Plus,
  X,
  Trash2,
  Pencil,
  CheckCircle2,
  RotateCcw,
  Clock,
  CalendarDays,
  Loader2,
  Link2,
  Users,
} from 'lucide-react';

const FREQUENCIES: TaskFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semester',
  'yearly',
  'one-time',
];

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  0: 'Sun',
};

interface TaskFormState {
  id?: string;
  title: string;
  description: string;
  due_date: string;
  frequency: TaskFrequency;
  weekdays: number[];
  category_id: string;
  assignee_ids: string[];
  links: ResourceLink[];
}

function emptyForm(selfId: string): TaskFormState {
  return {
    title: '',
    description: '',
    due_date: '',
    frequency: 'one-time',
    weekdays: [],
    category_id: '',
    assignee_ids: [selfId],
    links: [],
  };
}

export default function MyTasks() {
  const { profile, isAdminOrAbove } = useAuth();
  const {
    tasks,
    myTasks,
    profiles,
    profileById,
    loading,
    createTask,
    updateTask,
    deleteTask,
    completeTaskOccurrence,
    reopenTask,
  } = useTasks(profile);
  const { categories, categoryById } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();

  const canAssign = isAdminOrAbove;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [filter, setFilter] = useState<'mine' | 'all'>('mine');

  // Accountability acknowledgment before completing a task
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');

  // Open "new task" modal when navigating with ?new=1 (from Dashboard)
  useEffect(() => {
    if (canAssign && searchParams.get('new') === '1' && profile) {
      openCreate();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssign, profile?.id]);

  const list = filter === 'mine' || !canAssign ? myTasks : tasks;

  const sortedList = list; // already sorted by the hook: overdue → nearest deadline

  function openCreate() {
    if (!profile) return;
    setFormError('');
    setForm(emptyForm(profile.id));
    setShowModal(true);
  }

  function openEdit(task: Task) {
    setFormError('');
    setForm({
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      frequency: task.frequency,
      weekdays: task.weekdays ?? [],
      category_id: task.category_id ?? '',
      assignee_ids: task.assignee_ids ?? [],
      links: task.links ? [...task.links] : [],
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form) return;
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Task title is required.');
      return;
    }
    if (form.assignee_ids.length === 0) {
      setFormError('Select at least one assignee.');
      return;
    }
    const badLink = form.links.find((l) => l.url && !/^https?:\/\//i.test(l.url));
    if (badLink) {
      setFormError(`Link “${badLink.title || badLink.url}” must start with http:// or https://`);
      return;
    }

    setSaving(true);
    let res: { error?: string };
    if (form.id) {
      res = await updateTask(form.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        next_due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        frequency: form.frequency,
        weekdays:
          form.frequency === 'daily' && form.weekdays.length > 0
            ? [...form.weekdays].sort((a, b) => a - b)
            : null,
        category_id: form.category_id || null,
        assignee_ids: form.assignee_ids,
        links: form.links.filter((l) => l.url.trim()),
      } as Partial<Task>);
    } else {
      res = await createTask({
        title: form.title,
        description: form.description,
        due_date: form.due_date || null,
        frequency: form.frequency,
        weekdays: form.weekdays,
        assignee_ids: form.assignee_ids,
        category_id: form.category_id || null,
        links: form.links,
      });
    }
    setSaving(false);

    if (res.error) {
      setFormError(res.error);
      return;
    }
    setShowModal(false);
    setForm(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await deleteTask(deleteTarget.id);
    if (!res.error) setDeleteTarget(null);
  }

  function startComplete(task: Task) {
    setAckChecked(false);
    setCompletionNotes('');
    setCompleteTarget(task);
  }

  async function confirmComplete() {
    if (!completeTarget || !ackChecked) return;
    const res = await completeTaskOccurrence(completeTarget, completionNotes);
    if (!res.error) setCompleteTarget(null);
  }

  function toggleAssignee(id: string) {
    if (!form) return;
    setForm({
      ...form,
      assignee_ids: form.assignee_ids.includes(id)
        ? form.assignee_ids.filter((x) => x !== id)
        : [...form.assignee_ids, id],
    });
  }

  function toggleDay(idx: number) {
    if (!form) return;
    setForm({
      ...form,
      weekdays: form.weekdays.includes(idx)
        ? form.weekdays.filter((d) => d !== idx)
        : [...form.weekdays, idx],
    });
  }

  if (!profile) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canAssign
              ? 'Your assignments and the ones you manage.'
              : 'Tasks assigned to you. Complete them below — editing is done by your admin.'}
          </p>
        </div>
        {canAssign && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start"
          >
            <Plus size={16} /> New Task
          </button>
        )}
      </div>

      {canAssign && (
        <div className="flex gap-2 mb-6">
          {(['mine', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'mine' ? 'Assigned to Me' : 'All Tasks'}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : sortedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CalendarDays size={40} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-base font-medium">No tasks yet</p>
            <p className="text-gray-400 text-sm mt-1">
              {canAssign
                ? 'Click “New Task” to assign a task to any staff member.'
                : 'Tasks assigned to you will show up here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedList.map((task) => {
              const status = effectiveStatus(task);
              const isAssignedToMe = (task.assignee_ids ?? []).includes(profile.id);
              const isRecurring = task.frequency !== 'one-time';
              const daysLabel =
                task.frequency === 'daily' ? formatWeekdays(task.weekdays) : null;
              return (
                <li key={task.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`font-semibold text-gray-800 ${
                            status === 'completed' ? 'line-through text-gray-400' : ''
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
                          <Clock size={12} /> Due {formatDueDate(task.next_due_date ?? task.due_date)}
                        </span>
                        {daysLabel && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={12} /> Every {daysLabel}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {(task.assignee_ids ?? [])
                            .map((id) => profileById.get(id)?.full_name ?? 'Unknown')
                            .join(', ')}
                        </span>
                      </p>
                      {status === 'completed' && task.completed_at && (
                        <p className="text-[11px] text-green-600 mt-1.5">
                          ✓ Completed {formatDueDate(task.completed_at)}
                          {task.completed_by
                            ? ` by ${profileById.get(task.completed_by)?.full_name ?? 'staff'}`
                            : ''}
                          {isRecurring ? ' — next occurrence scheduled' : ''}
                        </p>
                      )}
                      <TaskLinks links={task.links} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Assigned users may ONLY mark complete (with accountability notice) */}
                      {isAssignedToMe && !canAssign && status !== 'completed' && (
                        <button
                          onClick={() => startComplete(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                        >
                          <CheckCircle2 size={14} /> Complete Task
                        </button>
                      )}
                      {isAssignedToMe && !canAssign && status === 'completed' && !isRecurring && (
                        <button
                          onClick={() => reopenTask(task)}
                          title="Reopen task"
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      {/* Admin/global edit */}
                      {canAssign && (
                        <>
                          {status !== 'completed' ? (
                            <button
                              onClick={() => startComplete(task)}
                              title="Mark current occurrence complete"
                              className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => reopenTask(task)}
                              title="Reopen task"
                              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(task)}
                            title="Edit task"
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(task)}
                            title="Delete task"
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create / Edit modal (admins only) */}
      {showModal && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {form.id ? 'Edit Task' : 'Assign New Task'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{formError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Submit monthly accomplishment report"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Optional details…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                >
                  <option value="">— No category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Tip: add categories (Reporting, Peace &amp; Order…) under Task Categories.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) =>
                      setForm({ ...form, frequency: e.target.value as TaskFrequency })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f.replace('-', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Daily → day-of-week picker */}
              {form.frequency === 'daily' && (
                <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Repeat on which days?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, weekdays: [1, 2, 3, 4, 5] })
                        }
                        className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                          JSON.stringify([...form.weekdays].sort()) ===
                          JSON.stringify([1, 2, 3, 4, 5])
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        ☑ Auto Mon–Fri
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] })
                        }
                        className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                          form.weekdays.length === 7
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        All days
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_ORDER.map((idx) => (
                      <label
                        key={idx}
                        className={`cursor-pointer select-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          form.weekdays.includes(idx)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={form.weekdays.includes(idx)}
                          onChange={() => toggleDay(idx)}
                        />
                        {DAY_SHORT[idx]}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {form.weekdays.length === 0
                      ? 'No days selected — the task will repeat every single day.'
                      : `Repeats on: ${form.weekdays
                          .slice()
                          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                          .map((d) => DAY_SHORT[d])
                          .join(', ')}`}
                  </p>
                </div>
              )}

              {/* Multiple assignees */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To * <span className="text-gray-400 font-normal">(multiple allowed)</span>
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {profiles.map((p: Profile) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.assignee_ids.includes(p.id)}
                        onChange={() => toggleAssignee(p.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700 truncate">
                        {p.full_name ?? p.email}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                        {ROLE_LABELS[p.role]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Resource links */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Link2 size={14} /> Resource Links
                  </span>{' '}
                  <span className="text-gray-400 font-normal">
                    (clickable for assigned staff)
                  </span>
                </label>
                <div className="space-y-2">
                  {form.links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={l.title}
                        onChange={(e) => {
                          const next = [...form.links];
                          next[i] = { ...next[i], title: e.target.value };
                          setForm({ ...form, links: next });
                        }}
                        placeholder="Link name (e.g., Report Template)"
                        className="w-2/5 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <input
                        value={l.url}
                        onChange={(e) => {
                          const next = [...form.links];
                          next[i] = { ...next[i], url: e.target.value };
                          setForm({ ...form, links: next });
                        }}
                        placeholder="https://…"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, links: form.links.filter((_, j) => j !== i) })
                        }
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Remove link"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, links: [...form.links, { title: '', url: '' }] })}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    <Plus size={14} /> Add link
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {form.id ? 'Save Changes' : 'Assign Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accountability acknowledgment before completing */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCompleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" /> Mark task as complete?
            </h3>
            <p className="text-sm font-semibold text-gray-700 mt-2">“{completeTarget.title}”</p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
              <p className="text-[13px] text-amber-800 leading-relaxed">
                <strong>Accountability Notice:</strong> By marking this task as complete you
                certify that the work has actually been accomplished and you will{' '}
                <strong>be held responsible and liable</strong> for the accuracy of this
                declaration in accordance with DILG service delivery and accountability
                standards. Falsification of task completion may subject you to administrative
                discipline.
              </p>
            </div>

            <label className="flex items-start gap-2 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={ackChecked}
                onChange={(e) => setAckChecked(e.target.checked)}
                className="mt-0.5 rounded text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">
                I confirm the task is truly completed and I accept responsibility for this
                declaration.
              </span>
            </label>

            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes / proof of completion…"
              className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setCompleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmComplete}
                disabled={!ackChecked}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Yes, It's Truly Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800">Delete task?</h3>
            <p className="text-sm text-gray-500 mt-1">
              “{deleteTarget.title}” will be permanently removed.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
