import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Tags, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { CATEGORY_COLORS, DEFAULT_CATEGORIES } from '../lib/taskMeta';
import type { TaskCategory } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Task Categories — Admins & Super Admins create categories such as
 * "Reporting" and "Peace & Order" (DILG Siquijor). Categories are selectable
 * when adding/assigning tasks. A one-click option seeds the DILG defaults.
 */
export default function Categories() {
  const { profile, isAdminOrAbove } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function add() {
    setError('');
    if (!name.trim()) return setError('Category name is required.');
    if (t.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return setError(`Category “${name.trim()}” already exists.`);
    }
    setBusy(true);
    const res = await t.createCategory({ name, color, description });
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setName('');
      setDescription('');
    }
  }

  async function seedDefaults() {
    setBusy(true);
    setError('');
    for (const def of DEFAULT_CATEGORIES) {
      if (t.categories.some((c) => c.name.toLowerCase() === def.name.toLowerCase())) continue;
      const res = await t.createCategory(def);
      if (res.error) {
        setError(res.error);
        break;
      }
    }
    setBusy(false);
    t.refetch();
  }

  async function saveRename(cat: TaskCategory) {
    if (!editName.trim()) return;
    await t.updateCategory(cat.id, { name: editName.trim() });
    setEditingId(null);
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
            <Tags size={22} className="text-blue-600" />
            Task Categories
          </h1>
          <p className="text-sm text-gray-500">
            Used when adding or assigning tasks — e.g. Reporting, Peace &amp; Order.
          </p>
        </div>
        {isAdminOrAbove && (
          <button
            onClick={seedDefaults}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add DILG default categories
          </button>
        )}
      </div>

      {isAdminOrAbove && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">New Category</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name * (e.g., Peace & Order)"
              className="sm:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="sm:col-span-5 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sm:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              title="Badge colour — the swatch shown on the category chip and on tasks in this category (not a number)"
            >
              {CATEGORY_COLORS.map((c) => (
                <option key={c} value={c}>
                  🎨 {c}
                </option>
              ))}
            </select>
            <button
              onClick={add}
              disabled={busy}
              className="sm:col-span-2 inline-flex justify-center items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {t.categories.map((cat) => {
          const count = t.categoryTaskCount.get(cat.id) ?? 0;
          const c = cat.color ?? '#64748b';
          return (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ color: c, backgroundColor: `${c}18` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                  {editingId === cat.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRename(cat)}
                      onBlur={() => saveRename(cat)}
                      className="bg-white border border-gray-300 rounded px-1 text-xs w-32"
                    />
                  ) : (
                    cat.name
                  )}
                </span>
                {isAdminOrAbove && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditName(cat.name);
                      }}
                      className="p-1.5 rounded text-blue-600 hover:bg-blue-50"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Delete category “${cat.name}”? Its ${count} task(s) will become uncategorized.`,
                          )
                        ) {
                          await t.deleteCategory(cat.id);
                        }
                      }}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              {cat.description && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{cat.description}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-2">{count} task(s)</p>
            </div>
          );
        })}
        {t.categories.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
            <p className="text-gray-500 font-medium">No categories yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Create one above, or click “Add DILG default categories”.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
