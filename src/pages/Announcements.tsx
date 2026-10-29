import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Megaphone, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useAnnouncements } from '../lib/useAnnouncements';
import type { Announcement } from '../lib/useAnnouncements';
import { isAdminOrAbove } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Announcements — available to ALL user roles.
 *  • STANDARD users can READ announcements only.
 *  • ADMIN / SUPER_ADMIN can Make Announcements (create / edit / delete).
 *
 * Announcements are NOT tasks: they have NO completion status and are NEVER
 * counted in task totals or statistics system-wide (separate table + RLS).
 */
export default function Announcements() {
  const { profile } = useOutletContext<Ctx>();
  const a = useAnnouncements();
  const canManage = isAdminOrAbove(profile?.role);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this announcement?')) return;
    await a.remove(id);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Megaphone size={22} className="text-blue-600" />
            Announcements
          </h1>
          <p className="text-sm text-gray-500">
            Office notices shown on the public dashboard ticker.{' '}
            <span className="font-medium text-gray-600">
              Not tasks — no completion status, never counted in task totals.
            </span>
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-bold shadow-sm"
          >
            <Plus size={15} /> Make Announcement
          </button>
        )}
      </div>

      {a.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          Could not load announcements ({a.error}). Re-run supabase/schema.sql to create the
          announcements table.
        </div>
      )}

      {formOpen && canManage && (
        <AnnouncementFormModal
          editing={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={async (title, body) => {
            const res = editing
              ? await a.update(editing.id, { title, body })
              : await a.create({ title, body, authorId: profile?.id ?? null });
            if (!res.error) {
              setFormOpen(false);
              setEditing(null);
            }
            return res;
          }}
        />
      )}

      {a.loading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
        </div>
      ) : a.announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
          <p className="text-gray-500 font-medium">No announcements yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            {canManage
              ? 'Click “Make Announcement” to post the first notice.' : 'Check back later for office notices.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {a.announcements.map((an) => (
            <li key={an.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-800 leading-snug">{an.title}</h2>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{an.body}</p>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {an.author_name ?? 'Staff'} ·{' '}
                    {an.created_at ? new Date(an.created_at).toLocaleString() : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex-shrink-0 flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(an);
                        setFormOpen(true);
                      }}
                      title="Edit announcement"
                      className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(an.id)}
                      title="Delete announcement"
                      className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnouncementFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Announcement | null;
  onClose: () => void;
  onSave: (title: string, body: string) => Promise<{ error?: string }>;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !body.trim()) {
      setErr('Both a title and a message are required.');
      return;
    }
    setSaving(true);
    const res = await onSave(title, body);
    setSaving(false);
    if (res.error) setErr(res.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Megaphone size={18} className="text-blue-600" />
            {editing ? 'Edit Announcement' : 'Make Announcement'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Water interruption tomorrow"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-3"
        />
        <label className="block text-xs font-semibold text-gray-500 mb-1">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Write the announcement…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
        />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-bold"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Publish'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Announcements appear on the public dashboard ticker immediately. They are not tasks and
          are not counted anywhere in task statistics.
        </p>
      </div>
    </div>
  );
}
