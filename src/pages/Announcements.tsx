import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Megaphone, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useAnnouncements, fiveW1H } from '../lib/useAnnouncements';
import type { Announcement, AnnouncementDetails } from '../lib/useAnnouncements';
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
          onSave={async (title, body, details) => {
            const res = editing
              ? await a.update(editing.id, { title, body, ...details })
              : await a.create({ title, body, authorId: profile?.id ?? null, ...details });
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
                  {/* WHAT (headline) — required */}
                  <h2 className="font-semibold text-gray-800 leading-snug break-words">{an.title}</h2>
                  {/* WHAT (details) — optional */}
                  {an.body?.trim() && (
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{an.body}</p>
                  )}
                  {/* 5W1H extras — shown only when filled in */}
                  {(() => {
                    const d = fiveW1H(an);
                    const rows: Array<[string, string]> = ([
                      ['Who', d.whois],
                      ['When', d.when],
                      ['Where', d.whereis],
                      ['Why', d.why],
                      ['How', d.how],
                    ) as Array<[string, string]>;
                    return rows
                      .filter(([, v]) => v.trim())
                      .map(([label, v]) => (
                        <p key={label} className="text-xs text-gray-600 mt-1 leading-snug break-words">
                          <span className="font-bold text-gray-700">{label}: </span>
                          <span className="whitespace-pre-wrap">{v}</span>
                        </p>
                      ));
                  })()}
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

/** Optional 5W1H field definitions (WHAT = title/message is handled above). */
const OPTIONAL_5W1H: Array<{
  key: keyof AnnouncementDetails;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  { key: 'whois', label: 'Who', hint: 'WHO is affected or involved?', placeholder: 'e.g. All department heads' },
  { key: 'when', label: 'When', hint: 'WHEN does it happen?', placeholder: 'e.g. Friday, Nov 7 · 8:00 AM' },
  { key: 'whereis', label: 'Where', hint: 'WHERE does it happen?', placeholder: 'e.g. Provincial Capitol LRT Lobby' },
  { key: 'why', label: 'Why', hint: 'WHY is this being announced?', placeholder: 'e.g. Scheduled power maintenance' },
  { key: 'how', label: 'How', hint: 'HOW will it proceed / what should staff do?', placeholder: 'e.g. Bring printed back-up files' },
];

function AnnouncementFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Announcement | null;
  onClose: () => void;
  onSave: (
    title: string,
    body: string,
    details: AnnouncementDetails,
  ) => Promise<{ error?: string }>;
}) {
  const d = editing ? fiveW1H(editing) : { whois: '', when: '', whereis: '', why: '', how: '' };
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [details, setDetails] = useState<AnnouncementDetails>(d);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    // ONLY WHAT (the headline) is required to save/publish an announcement.
    if (!title.trim()) {
      setErr('The WHAT (headline) is required — add at least a short title before publishing.');
      return;
    }
    setSaving(true);
    const res = await onSave(title, body, details);
    setSaving(false);
    if (res.error) setErr(res.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 min-w-0">
            <Megaphone size={18} className="text-blue-600 flex-shrink-0" />
            <span className="truncate">{editing ? 'Edit Announcement' : 'Make Announcement'}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── WHAT — the only REQUIRED part of an announcement ── */}
        <fieldset className="border border-blue-200 rounded-lg p-3 mb-3">
          <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-blue-700">
            What <span className="text-red-600">*</span> — Required
          </legend>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Headline <span className="text-red-500">(required)</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="WHAT is being announced? e.g. Water interruption tomorrow"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-2"
          />
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Message <span className="font-normal text-gray-400">(optional details)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add any extra details about the WHAT…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
          />
        </fieldset>

        {/* ── 5W1H extras — all optional ── */}
        <p className="text-[11px] text-gray-500 mb-2">
          The rest of the{' '}
          <span className="font-bold">5W1H (Who · When · Where · Why · How)</span> is optional —
          fill in only what applies. You can publish with just the WHAT above.
        </p>
        <div className="space-y-2.5">
          {OPTIONAL_5W1H.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {f.label}{' '}
                <span className="font-normal text-gray-400">— {f.hint}</span>
              </label>
              <input
                value={details[f.key] ?? ''}
                onChange={(e) => setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-4">
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
          Announcements appear on the public dashboard preview carousel immediately. They are not
          tasks and are not counted anywhere in task statistics.
        </p>
      </div>
    </div>
  );
}
