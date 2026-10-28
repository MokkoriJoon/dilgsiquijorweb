import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useCategories } from '../lib/useCategories';
import type { TaskCategory } from '../lib/types';
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Tags,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

const PRESET_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#ca8a04', // amber
  '#475569', // slate
];

interface CatFormState {
  id?: string;
  name: string;
  description: string;
  color: string;
}

/**
 * Task Categories — e.g. Reporting, Peace & Order (DILG Siquijor).
 * Admins and Super Admins can create/edit/delete; every logged-in user can view.
 * Categories are used when adding/assigning tasks.
 */
export default function CategoriesPage() {
  const { profile, isAdminOrAbove } = useAuth();
  const { categories, loading, error, createCategory, updateCategory, deleteCategory } =
    useCategories();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CatFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TaskCategory | null>(null);

  function openCreate() {
    setFormError('');
    setForm({ name: '', description: '', color: PRESET_COLORS[0] });
    setShowModal(true);
  }

  function openEdit(cat: TaskCategory) {
    setFormError('');
    setForm({
      id: cat.id,
      name: cat.name,
      description: cat.description ?? '',
      color: cat.color || PRESET_COLORS[0],
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form || !profile) return;
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Category name is required.');
      return;
    }
    setSaving(true);
    let res: { error?: string };
    if (form.id) {
      res = await updateCategory(form.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
      });
    } else {
      res = await createCategory({
        name: form.name,
        description: form.description,
        color: form.color,
        createdBy: profile.id,
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
    const res = await deleteCategory(deleteTarget.id);
    if (!res.error) setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Task Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Classifications used when assigning tasks — e.g. Reporting, Peace &amp; Order.
          </p>
        </div>
        {isAdminOrAbove && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start"
          >
            <Plus size={16} /> New Category
          </button>
        )}
      </div>

      {!isAdminOrAbove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 flex items-center gap-2 text-blue-700 text-sm">
          <ShieldCheck size={16} />
          Only Admins and Super Admins can create or edit categories. You can view them here
          and they appear when your tasks are assigned.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Tags size={40} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-base font-medium">No categories yet</p>
            <p className="text-gray-400 text-sm mt-1">
              {isAdminOrAbove
                ? 'Create one like “Reporting” or “Peace & Order” to get started.'
                : 'Ask an admin to add task categories.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <li key={cat.id} className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                  <span
                    className="mt-1 w-4 h-4 rounded-full flex-shrink-0 border border-black/10"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">{cat.name}</p>
                    {cat.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{cat.description}</p>
                    )}
                  </div>
                </div>
                {isAdminOrAbove && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(cat)}
                      title="Edit category"
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(cat)}
                      title="Delete category"
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </li>
            ))}
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
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {form.id ? 'Edit Category' : 'New Task Category'}
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
                  Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Reporting, Peace & Order, Lingap sa Masa"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Optional — what kind of tasks belong here?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        form.color === c
                          ? 'border-gray-800 scale-110'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Pick color ${c}`}
                    />
                  ))}
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
                {form.id ? 'Save Changes' : 'Create Category'}
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
            <h3 className="text-lg font-bold text-gray-800">Delete category?</h3>
            <p className="text-sm text-gray-500 mt-1">
              “{deleteTarget.name}” will be removed. Tasks using it will become uncategorized.
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
