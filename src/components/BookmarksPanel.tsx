import { useEffect, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';
import type { Bookmark } from '../lib/types';
import { normalizeUrl } from '../lib/useTasks';
import { Plus, X, ExternalLink, Trash2, Bookmark as BookmarkIcon, Loader2 } from 'lucide-react';

/**
 * Self-view bookmarks — personal resource links saved by any user type.
 * Only the owner can see/edit them (enforced by RLS).
 */
export default function BookmarksPanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setItems((data ?? []) as Bookmark[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function add() {
    setError('');
    if (!profile) return;
    if (!label.trim()) return setError('Bookmark label is required.');
    if (!url.trim()) return setError('Bookmark URL is required.');
    setSaving(true);
    const { error: err } = await supabase.from('bookmarks').insert({
      user_id: profile.id,
      label: label.trim(),
      url: normalizeUrl(url),
      note: note.trim() || null,
    });
    setSaving(false);
    if (err) return setError(err.message);
    setLabel('');
    setUrl('');
    setNote('');
    load();
  }

  async function remove(id: string) {
    await supabase.from('bookmarks').delete().eq('id', id);
    setItems((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
        <BookmarkIcon size={18} className="text-blue-600" />
        My Bookmarks
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Personal resource links visible only to you — save any reference you use often.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-4">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label *"
          className="sm:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="sm:col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="sm:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={add}
          disabled={saving}
          className="sm:col-span-2 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add bookmark
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">No personal bookmarks yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((b) => (
            <li key={b.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-medium text-blue-700 hover:underline inline-flex items-center gap-1 truncate"
                >
                  <ExternalLink size={13} />
                  {b.label}
                </a>
                <p className="text-xs text-gray-400 truncate">{b.url}</p>
                {b.note && <p className="text-xs text-gray-500 mt-0.5">{b.note}</p>}
              </div>
              <button
                onClick={() => remove(b.id)}
                className="p-2 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0"
                title="Delete bookmark"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { X };
