import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useTasks, formatDueDate } from '../lib/useTasks';
import type { Task, TaskFrequency, TaskStatus } from '../lib/types';
import { ROLE_LABELS } from '../lib/types';
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

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  'in-progress': { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
};

interface TaskFormState {
  id?: string;
  title: string;
  description: string;
  due_date: string;
  frequency: TaskFrequency;
  status: TaskStatus;
  assigned_to: string;
}

export default function MyTasks() {
  const { profile } = useAuth();
  const { tasks, myTasks, profiles, profileById, loading, createTask, updateTask, deleteTask } =
    useTasks(profile);
  const [searchParams, setSearchParams] = useSearchParams();

  const canAssign = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN';

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [filter, setFilter] = useState<'mine' | 'all'>('mine');

  // Open "new task" modal when navigating with ?new=1 (from Dashboard)
  useEffect(() => {
    if (canAssign && searchParams.get('new') === '1') {
      openCreate();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssign]);

  const list = filter === 'mine' || !canAssign ? myTasks : tasks;

  const sortedList = useMemo(
    () =>
      [...list].sort((a, b) =>
        (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'),
      ),
    [list],
  );

  function openCreate() {
    setFormError('');
    setForm({
      title: '',
      description: '',
      due_date: '',
      frequency: 'one-time',
      status: 'pending',
      assigned_to: profile?.id ?? '',
    });
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
      status: task.status,
      assigned_to: task.assigned_to,
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
    if (!form.assigned_to) {
      setFormError('Please select an assignee.');
      return;
    }

    setSaving(true);
    let res: { error?: string };
    if (form.id) {
      res = await updateTask(form.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        frequency: form.frequency,
        status: form.status,
        ...(canAssign ? { assigned_to: form.assigned_to } : {}),
      });
    } else {
      res = await createTask({
        title: form.title,
        description: form.description,
        due_date: form.due_date || null,
        frequency: form.frequency,
        assigned_to: form.assigned_to,
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

  async function toggleStatus(task: Task) {
    const next: TaskStatus =
      task.status === 'completed' ? 'pending' : 'completed';
    await updateTask(task.id, { status: next });
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
              : 'Tasks assigned to you.'}
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
              const assignee = profileById.get(task.assigned_to);
              const isMine = task.assigned_to === profile.id;
              return (
                <li key={task.id} className="p-4 sm:p-5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`font-semibold text-gray-800 ${
                            task.status === 'completed'
                              ? 'line-through text-gray-400'
                              : ''
                          }`}
                        >
                          {task.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[task.status].cls}`}
                        >
                          {STATUS_META[task.status].label}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 capitalize">
                          {task.frequency.replace('-', ' ')}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Due {formatDueDate(task.due_date)}
                        </span>
                        <span>
                          Assigned to:{' '}
                          <span className="font-medium text-gray-500">
                            {assignee?.full_name ?? 'Unknown'}
                          </span>
                          {assignee ? ` (${ROLE_LABELS[assignee.role]})` : ''}
                        </span>
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(isMine || canAssign) && (
                        <button
                          onClick={() => toggleStatus(task)}
                          title={
                            task.status === 'completed'
                              ? 'Reopen task'
                              : 'Mark complete'
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            task.status === 'completed'
                              ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {task.status === 'completed' ? (
                            <RotateCcw size={16} />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                        </button>
                      )}
                      {(isMine || canAssign) && (
                        <button
                          onClick={() => openEdit(task)}
                          title="Edit task"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {canAssign && (
                        <button
                          onClick={() => setDeleteTarget(task)}
                          title="Delete task"
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create / Edit modal */}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Submit monthly accomplishment report"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                  placeholder="Optional details…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Frequency
                  </label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as TaskStatus })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white capitalize"
                  >
                    {Object.entries(STATUS_META).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                {canAssign && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Assign To *
                    </label>
                    <select
                      value={form.assigned_to}
                      onChange={(e) =>
                        setForm({ ...form, assigned_to: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                    >
                      <option value="">Select staff member…</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name ?? p.email} — {ROLE_LABELS[p.role]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
