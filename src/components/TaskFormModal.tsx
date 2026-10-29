import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Task, TaskCategory } from '../lib/types';
import { isAdminOrAbove as isAdminRole } from '../lib/types';
import {
  CATEGORY_COLORS,
  STATUS_META,
  DEFAULT_CATEGORIES,
} from '../lib/taskMeta';
import { NAMED_CATEGORY_COLORS } from '../lib/categoryColors';
import { describeRecurrence } from '../lib/recurrence';
import {
  X,
  Plus,
  Loader2,
  Tag,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Save,
  Lock,
  User,
  Users,
} from 'lucide-react';

/**
 * Shared create/edit form for tasks — used by "Task Management" (global edit),
 * the Dashboard, and the Personal-Tasks flow in My Tasks.
 *
 * Supports: category selection + inline category creation, multiple assignees,
 * recurrence rules (with weekday picker for Daily), clickable resource links,
 * Complete/Pending status, and PERSONAL tasks (private to their owner and never
 * counted in the organization-wide totals).
 *
 * Role rules enforced here (mirrored by RLS in supabase/schema.sql):
 *  • Only Admins / Super Admins may create ORGANIZATION ("system") tasks and
 *    assign them to other staff members.
 *  • Standard users may only add/edit their own personal tasks.
 *  • Inline category creation ("New category" → Add) is admin-only.
 */

export interface TaskDraft {
  title: string;
  description: string;
  due_date: string; // yyyy-mm-dd or ''
  frequency: string;
  days_of_week: number[];
  repeat_forever: boolean;
  category_id: string;
  assignees: string[];
  links: { label: string; url: string }[];
  status: 'pending' | 'completed';
  /** Private, personal-to-owner task — excluded from all system counts. */
  is_personal: boolean;
}

const WEEKDAYS = [
  { idx: 0, label: 'Mon' },
  { idx: 1, label: 'Tue' },
  { idx: 2, label: 'Wed' },
  { idx: 3, label: 'Thu' },
  { idx: 4, label: 'Fri' },
  { idx: 5, label: 'Sat' },
  { idx: 6, label: 'Sun' },
];

export function emptyDraft(userId?: string, isPersonal = false): TaskDraft {
  return {
    title: '',
    description: '',
    due_date: '',
    frequency: 'one-time',
    days_of_week: [0, 1, 2, 3, 4],
    repeat_forever: true,
    category_id: '',
    // Personal tasks always belong to their owner only.
    assignees: userId ? [userId] : [],
    links: [],
    status: 'pending',
    is_personal: isPersonal,
  };
}

export function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ? task.due_date.slice(0, 10) : '',
    frequency: task.frequency ?? 'one-time',
    days_of_week:
      Array.isArray(task.days_of_week) && task.days_of_week.length > 0
        ? task.days_of_week
        : [0, 1, 2, 3, 4],
    repeat_forever: task.repeat_forever ?? true,
    category_id: task.category_id ?? '',
    assignees:
      task.assignees && task.assignees.length > 0
        ? task.assignees
        : task.assigned_to
          ? [task.assigned_to]
          : [],
    links: (task.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    status: task.status === 'completed' ? 'completed' : 'pending',
    is_personal: !!task.is_personal,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  categories: TaskCategory[];
  profiles: { id: string; full_name: string | null; email: string | null; position: string | null }[];
  onSubmit: (draft: TaskDraft) => Promise<{ error?: string }>;
  onCategoryCreated?: (cat: TaskCategory) => void;
  /** When false the user may only complete/reopen their own task (no global edit). */
  canEditDetails?: boolean;
  /** Role of the current user — Standard users cannot create organization tasks. */
  role?: string | null;
  /** The logged-in user's id (used to pre-fill / lock personal-task assignees). */
  currentUserId?: string;
  /** Force the form into "personal task" mode when creating a new task. */
  defaultPersonal?: boolean;
  /** Hide the personal/system toggle (e.g. inside the Personal Tasks section). */
  lockPersonal?: boolean;
  /** Only offer ORGANIZATION categories in the dropdown (Task Management /
   *  Super Admin area — personal categories live in "My Tasks"). */
  orgCategoriesOnly?: boolean;
}

export default function TaskFormModal({
  open,
  onClose,
  task,
  categories,
  profiles,
  onSubmit,
  onCategoryCreated,
  canEditDetails = true,
  role,
  currentUserId,
  defaultPersonal = false,
  lockPersonal = false,
  orgCategoriesOnly = false,
}: Props) {
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft());
  const [newCatName, setNewCatName] = useState('');
  /** Colour chosen for the inline "New category" creation. */
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0]);
  const [showCatInput, setShowCatInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /** Admins & Super Admins may create organization tasks + new categories. */
  const canCreateOrgTasks = isAdminRole(role);
  /** Standard users can only ever work with personal tasks. */
  const personalOnly = !canCreateOrgTasks;
  /** Editing an existing personal task keeps it personal. */
  const editingPersonal = !!task?.is_personal;
  /** SUPER ADMIN / Task Management area → always ORGANIZATION tasks. */
  const forceOrg = orgCategoriesOnly && !personalOnly;

  /** Category options shown in the dropdown — defensive against undefined. */
  const categoryOptions = (Array.isArray(categories) ? categories : []).filter(
    (c) => !orgCategoriesOnly || !c.is_personal,
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    setShowCatInput(false);
    setNewCatName('');
    if (task) {
      setDraft(draftFromTask(task));
    } else {
      if (forceOrg) {
        // Task Management (Admins/Super Admins) → ORGANIZATION task, never personal.
        setDraft({ ...emptyDraft(currentUserId, false), assignees: currentUserId ? [currentUserId] : [] });
      } else {
        const asPersonal = personalOnly || defaultPersonal;
        setDraft(asPersonal ? emptyDraft(currentUserId, true) : emptyDraft(currentUserId, false));
      }
    }
  }, [open, task, personalOnly, defaultPersonal, currentUserId, forceOrg]);

  /** Toggle between "Personal" and "Organization" task type (admins only). */
  function setPersonal(value: boolean) {
    setDraft((d) => {
      if (value) {
        // Personal → assigned ONLY to me.
        return { ...d, is_personal: true, assignees: currentUserId ? [currentUserId] : [] };
      }
      // Organization → at minimum myself so the list is never empty.
      const assignees = d.assignees.length > 0 ? d.assignees : currentUserId ? [currentUserId] : [];
      return { ...d, is_personal: false, assignees };
    });
  }

  function toggleDay(idx: number) {
    setDraft((d) => ({
      ...d,
      days_of_week: d.days_of_week.includes(idx)
        ? d.days_of_week.filter((x) => x !== idx)
        : [...d.days_of_week, idx].sort(),
    }));
  }

  function toggleAssignee(id: string) {
    if (draft.is_personal) return; // personal tasks belong to the owner only
    setDraft((d) => ({
      ...d,
      assignees: d.assignees.includes(id)
        ? d.assignees.filter((x) => x !== id)
        : [...d.assignees, id],
    }));
  }

  async function addCategory() {
    if (!canCreateOrgTasks) {
      setError('Only Admins and Super Admins can create organization task categories.');
      return;
    }
    const name = newCatName.trim();
    if (!name) return;
    // Friendly duplicate check BEFORE hitting the DB unique index — a raw
    // `duplicate key value violates unique constraint "task_categories_name_key"`
    // error otherwise scares users with the "Something went wrong" screen.
    if (categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      setError(`Category “${name}” already exists. Pick it from the dropdown instead.`);
      return;
    }
    const { data, error: err } = await supabase
      .from('task_categories')
      .insert({
        name,
        color: newCatColor,
        description: null,
        created_by: currentUserId ?? null,
        // Created from this admin surface → always an ORGANIZATION category.
        is_personal: false,
        owner_id: null,
      })
      .select()
      .single();
    if (err) {
      if (/duplicate key/i.test(err.message)) {
        setError(`Category “${name}” already exists. Pick it from the dropdown instead.`);
      } else {
        setError(err.message);
      }
      return;
    }
    const cat = data as TaskCategory;
    setDraft((d) => ({ ...d, category_id: cat.id }));
    setNewCatName('');
    setShowCatInput(false);
    onCategoryCreated?.(cat);
  }

  /** Seed the standard DILG default categories in one click (skips existing). */
  async function seedDefaults() {
    if (!canCreateOrgTasks) return;
    setSaving(true);
    let failed = '';
    for (const def of DEFAULT_CATEGORIES) {
      const exists = categories.some((c) => c.name.trim().toLowerCase() === def.name.toLowerCase());
      if (exists) continue;
      const { error: err } = await supabase.from('task_categories').insert({
        name: def.name,
        color: def.color,
        description: def.description,
        created_by: currentUserId ?? null,
        is_personal: false,
        owner_id: null,
      });
      if (err && !/duplicate key/i.test(err.message)) {
        failed = err.message;
        break;
      }
    }
    setSaving(false);
    setError(failed);
    if (!failed) onCategoryCreated?.({ id: '', name: '', color: null, description: null, created_by: null });
  }

  async function handleSubmit() {
    setError('');
    if (!canEditDetails) {
      // Assignees cannot change task details — only completion state.
      const res = await onSubmit({ ...draft, title: task?.title ?? draft.title });
      if (res.error) setError(res.error);
      else onClose();
      return;
    }
    // ---- Permission guards (also enforced by Supabase RLS) ----
    if (personalOnly && !draft.is_personal) {
      return setError(
        'Standard users cannot create organization tasks. Please save this as a Personal Task.',
      );
    }
    if (draft.is_personal && currentUserId && !draft.assignees.includes(currentUserId)) {
      return setError('A personal task must be assigned to you.');
    }
    if (!draft.title.trim()) return setError('Task title is required.');
    if (draft.assignees.length === 0) return setError('Select at least one assignee.');
    if (draft.frequency !== 'one-time' && !draft.due_date)
      return setError('Recurring tasks need a start / first due date.');
    const badLink = draft.links.find((l) => l.label.trim() && !l.url.trim());
    if (badLink) return setError('Every resource link needs a URL.');

    setSaving(true);
    const res = await onSubmit(draft);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
  }

  if (!open) return null;

  const dailyPreview = describeRecurrence({
    frequency: 'daily',
    days_of_week: draft.days_of_week,
    repeat_forever: draft.repeat_forever,
  });

  const showTypeSection = !lockPersonal && (!task || canEditDetails);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            {task
              ? canEditDetails
                ? editingPersonal
                  ? 'Edit Personal Task'
                  : 'Edit Task'
                : 'Update Task Status'
              : personalOnly || defaultPersonal
                ? 'Add New Personal Task'
                : 'Assign New Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {!canEditDetails && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-700">
              Assigned staff may only record completion — editing or deleting a task is reserved
              for Admins and Super Admins.
            </p>
          </div>
        )}

        {/* Standard users: they cannot raise tasks for the system/organization. */}
        {canEditDetails && personalOnly && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <Lock size={14} className="mt-0.5 flex-shrink-0 text-violet-600" />
            <p className="text-xs text-violet-800 leading-relaxed">
              As a <strong>Standard user</strong> you cannot create or assign tasks for the system
              or the organization. You may add <strong>Personal Tasks</strong> here — visible only
              to you and <strong>never counted in the organization’s totals</strong>. Ask an Admin
              or Super Admin to create official tasks.
            </p>
          </div>
        )}

        <div className={`space-y-4 ${canEditDetails ? '' : 'opacity-60 pointer-events-none'}`}>
          {/* ── TASK TYPE ────────────────────────────────────────────────
              Kept ABOVE the Title so the very first choice in the form is
              whether this is a private personal task or an organization one. */}
          {showTypeSection && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
              {lockPersonal || personalOnly ? (
                <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                  <User size={15} className="mt-0.5 text-violet-600 flex-shrink-0" />
                  <p className="text-xs text-violet-800">
                    <strong>Personal Task</strong> — visible only to you and not counted in the
                    whole system (organization dashboards, boards and statistics).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPersonal(true)}
                    className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                      draft.is_personal
                        ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
                        : 'border-gray-300 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                      <User size={14} className="text-violet-600" /> Personal Task
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      Only you can see it. Not counted in the system.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonal(false)}
                    className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                      !draft.is_personal
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-300 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                      <Users size={14} className="text-blue-600" /> Organization Task
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      Visible to everyone and counted system-wide.
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── TASK CATEGORY (with inline "New category" → Add) ───────── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Category</label>
            <div className="flex gap-2">
              <select
                value={draft.category_id}
                onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
              >
                <option value="">No category</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_personal ? ' (Personal)' : ''}
                  </option>
                ))}
              </select>
              {canCreateOrgTasks && (
                <button
                  type="button"
                  onClick={() => setShowCatInput((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                  title="Create a new category (Reporting, Peace & Order, …)"
                >
                  <Tag size={14} /> New category
                </button>
              )}
            </div>
            {canCreateOrgTasks && showCatInput && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g., Peace & Order"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    Add
                  </button>
                </div>

                {/* ── Colour selection for the new category ─────────────── */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-600">Colour:</span>
                  <select
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    title="Badge colour of the new category"
                  >
                    {NAMED_CATEGORY_COLORS.map((c) => (
                      <option key={c.hex} value={c.hex}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {/* Live swatch + quick-pick dots */}
                  <span
                    className="w-6 h-6 rounded-md border border-gray-200 inline-block flex-shrink-0"
                    style={{ backgroundColor: newCatColor }}
                    title="Selected colour preview"
                  />
                  <span className="flex gap-1 flex-wrap">
                    {NAMED_CATEGORY_COLORS.slice(0, 8).map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setNewCatColor(c.hex)}
                        title={c.name}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${
                          newCatColor === c.hex
                            ? 'border-gray-800 scale-110'
                            : 'border-transparent hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </span>
                </div>

                {/* One-click seed of the standard DILG categories */}
                <button
                  type="button"
                  onClick={seedDefaults}
                  disabled={saving}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  title="Adds the standard DILG categories (Reporting, Peace & Order, …) — existing ones are skipped"
                >
                  <Plus size={12} /> Add DILG default categories
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g., Submit monthly accomplishment report"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              placeholder="Optional details…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {draft.frequency === 'one-time' ? 'Due Date' : 'Starts On / First Due'}
              </label>
              <input
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={draft.frequency}
                onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
              >
                {['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'semester', 'yearly'].map(
                  (f) => (
                    <option key={f} value={f}>
                      {f === 'one-time' ? 'One-time' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* Daily → weekday selection */}
          {draft.frequency === 'daily' && (
            <div className="border border-indigo-100 bg-indigo-50/60 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Repeat on which days of the week?
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => toggleDay(d.idx)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      draft.days_of_week.includes(d.idx)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={
                      draft.days_of_week.length === 5 &&
                      [0, 1, 2, 3, 4].every((x) => draft.days_of_week.includes(x))
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days_of_week: e.target.checked ? [0, 1, 2, 3, 4] : [],
                      })
                    }
                  />
                  Automatic Mon–Fri (weekdays)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={draft.days_of_week.length === 7}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days_of_week: e.target.checked ? [0, 1, 2, 3, 4, 5, 6] : [],
                      })
                    }
                  />
                  All days of the week
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={draft.days_of_week.length === 0}
                    onChange={(e) =>
                      setDraft({ ...draft, days_of_week: e.target.checked ? [] : [0, 1, 2, 3, 4] })
                    }
                  />
                  Every single day (including weekends, no weekday filter)
                </label>
              </div>
              <p className="text-[11px] text-indigo-700">Schedule preview: {dailyPreview}</p>
            </div>
          )}

          {draft.frequency !== 'one-time' && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={draft.repeat_forever}
                onChange={(e) => setDraft({ ...draft, repeat_forever: e.target.checked })}
              />
              Keep repeating indefinitely
              {!draft.repeat_forever && (
                <span className="text-xs text-gray-500">(ends after the first scheduled date)</span>
              )}
            </label>
          )}

          {/* Multiple assignees — organization tasks only (admins & superadmin). */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign To *{' '}
              <span className="text-xs text-gray-400">
                {draft.is_personal ? '— personal task: only you' : '— multiple users allowed'}
              </span>
            </label>

            {draft.is_personal ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                <User size={15} className="text-violet-600 flex-shrink-0" />
                <span className="font-medium">
                  {profiles.find((p) => p.id === currentUserId)?.full_name ?? 'Me (only me)'}
                </span>
                <span className="text-xs text-gray-400">Private · visible only to you</span>
              </div>
            ) : (
              <>
                <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {(canCreateOrgTasks ? profiles : profiles.filter((p) => p.id === currentUserId)
                  ).map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={draft.assignees.includes(p.id)}
                        onChange={() => toggleAssignee(p.id)}
                      />
                      <span className="font-medium text-gray-700">{p.full_name ?? p.email}</span>
                      {p.position && <span className="text-xs text-gray-400">{p.position}</span>}
                    </label>
                  ))}
                  {profiles.length === 0 && (
                    <p className="px-3 py-3 text-sm text-gray-400">No staff accounts found.</p>
                  )}
                </div>
                {!canCreateOrgTasks && (
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <Lock size={11} /> Standard users can only assign tasks to themselves.
                  </p>
                )}
                {draft.assignees.length > 1 && (
                  <p className="text-xs text-blue-600 mt-1">
                    {draft.assignees.length} people will each be able to complete this task.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Resource links */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link / Resource Links{' '}
              <span className="text-xs text-gray-400">— clickable by assigned users</span>
            </label>
            <div className="space-y-2">
              {draft.links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.label}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        links: draft.links.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="Label (e.g., DILG MC 2026-001)"
                    className="w-2/5 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    value={l.url}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        links: draft.links.map((x, j) =>
                          j === i ? { ...x, url: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="https://…"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })
                    }
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    title="Remove link"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDraft({ ...draft, links: [...draft.links, { label: '', url: '' }] })}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus size={14} /> Add link
              </button>
            </div>
          </div>
        </div>

        {/* Status — always editable (Complete / Pending; Overdue is automatic) */}
        {(task || !canEditDetails) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="flex flex-wrap gap-2 items-center">
              {(['pending', 'completed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border inline-flex items-center gap-1.5 ${
                    draft.status === s
                      ? s === 'completed'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s === 'completed' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {STATUS_META[s].label}
                </button>
              ))}
              <span className="text-xs text-gray-400">
                Overdue is derived automatically from the schedule.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Link2 size={12} />
            {draft.links.filter((l) => l.url.trim()).length} link(s) ·{' '}
            {draft.assignees.length} assignee(s)
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {task ? 'Save Changes' : draft.is_personal ? 'Save Personal Task' : 'Assign Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
