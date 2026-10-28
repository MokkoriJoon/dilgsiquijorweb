import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { useBookmarks, collectTaskLinks } from '../lib/useCategories';
import { effectiveStatus } from '../lib/recurrence';
import { StatusBadge } from '../components/TaskBadges';
import type { ResourceLink } from '../lib/types';
import {
  Link2,
  Plus,
  Trash2,
  Star,
  ExternalLink,
  BookmarkPlus,
  X,
} from 'lucide-react';

/**
 * Resource Links — available to ALL user types.
 *  1. "From my tasks": every link attached to tasks assigned to the user.
 *  2. "My bookmarks": personal self-view links the user saves themselves
 *     (stored per-user in Supabase, mirrored locally as fallback).
 */
export default function ResourcesPage() {
  const { profile } = useAuth();
  const { tasks, loading } = useTasks(profile);
  const { bookmarks, addBookmark, removeBookmark } = useBookmarks(profile);

  const [tab, setTab] = useState<'tasks' | 'bookmarks'>('tasks');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ title: '', url: '' });
  const [addError, setAddError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  const taskLinks = profile ? collectTaskLinks(tasks, profile.id) : [];

  async function handleAdd() {
    setAddError('');
    const res = await addBookmark(draft);
    if (res.error) {
      setAddError(res.error);
      return;
    }
    setDraft({ title: '', url: '' });
    setShowAdd(false);
    setSavedNote('Bookmark saved ✔');
    setTimeout(() => setSavedNote(''), 2500);
  }

  function quickBookmark(link: ResourceLink) {
    addBookmark(link).then((res) => {
      if (!res.error) {
        setSavedNote(`“${link.title || link.url}” added to your bookmarks ✔`);
        setTimeout(() => setSavedNote(''), 2500);
      }
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Resource Links</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          All links attached to the tasks assigned to you, plus your personal bookmarks.
        </p>
      </div>

      {savedNote && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {savedNote}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('tasks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            tab === 'tasks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Link2 size={15} /> From My Tasks ({taskLinks.length})
        </button>
        <button
          onClick={() => setTab('bookmarks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            tab === 'bookmarks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Star size={15} /> My Bookmarks ({bookmarks.length})
        </button>
      </div>

      {tab === 'tasks' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : taskLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Link2 size={40} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No resource links yet</p>
              <p className="text-gray-400 text-sm mt-1">
                When an admin attaches a link to a task assigned to you, it shows up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {taskLinks.map(({ link, task }, i) => (
                <li key={i} className="p-4 sm:p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900 hover:underline text-sm"
                    >
                      {link.title || link.url} <ExternalLink size={13} />
                    </a>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="truncate max-w-[240px]">{task.title}</span>
                      <StatusBadge task={task} />
                    </p>
                  </div>
                  <button
                    onClick={() => quickBookmark(link)}
                    title="Save to My Bookmarks"
                    className="inline-flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                  >
                    <BookmarkPlus size={14} /> Bookmark
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => {
                setAddError('');
                setShowAdd(true);
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Add Bookmark
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {bookmarks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Star size={40} className="text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No personal bookmarks yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Save useful links for yourself — only you can see them.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {bookmarks.map((b) => (
                  <li key={b.url} className="p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900 hover:underline text-sm"
                      >
                        {b.title} <ExternalLink size={13} />
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{b.url}</p>
                    </div>
                    <button
                      onClick={() => removeBookmark(b.url)}
                      title="Remove bookmark"
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Add bookmark modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Personal Bookmark</h3>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            {addError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
                {addError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g., DILG Memorandum Circular Portal"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Silence unused-import warnings when effectiveStatus is tree-shaken away.
void effectiveStatus;
