import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, Link2, Search } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import BookmarksPanel from '../components/BookmarksPanel';
import type { Profile, Task } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Resource Links — available to ALL user types.
 *  • Every link attached to tasks assigned to the current user, grouped by task.
 *  • Personal self-view bookmarks (private to the owner) via BookmarksPanel.
 */
export default function ResourceLinks() {
  const { profile } = useOutletContext<Ctx>();
  const t = useTasks(profile);
  const [q, setQ] = useState('');

  const grouped = useMemo(() => {
    const rows: { task: Task; links: { id: string; label: string; url: string }[] }[] = [];
    for (const task of t.myTasks) {
      const links = (task.links ?? []).filter(
        (l) =>
          !q.trim() ||
          l.label.toLowerCase().includes(q.trim().toLowerCase()) ||
          l.url.toLowerCase().includes(q.trim().toLowerCase()) ||
          task.title.toLowerCase().includes(q.trim().toLowerCase()),
      );
      if (links.length > 0) rows.push({ task, links });
    }
    return rows;
  }, [t.myTasks, q]);

  const totalLinks = grouped.reduce((n, g) => n + g.links.length, 0);

  if (t.loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Link2 size={22} className="text-blue-600" />
          Resource Links
        </h1>
        <p className="text-sm text-gray-500">
          All links attached to your assigned tasks ({totalLinks} shown), plus your personal
          bookmarks.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter links or tasks…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
          </div>

          {grouped.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
              <p className="text-gray-500 font-medium">No resource links on your tasks yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Admins can attach clickable links when assigning a task.
              </p>
            </div>
          ) : (
            grouped.map(({ task, links }) => (
              <div
                key={task.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              >
                <h2 className="font-semibold text-gray-800">{task.title}</h2>
                {task.category && (
                  <span
                    className="inline-block mt-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
                    style={{
                      color: task.category.color ?? '#64748b',
                      backgroundColor: `${task.category.color ?? '#64748b'}18`,
                    }}
                  >
                    {task.category.name}
                  </span>
                )}
                <ul className="mt-3 divide-y divide-gray-100">
                  {links.map((l) => (
                    <li key={l.id} className="py-2">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
                      >
                        <ExternalLink size={13} />
                        {l.label}
                      </a>
                      <p className="text-xs text-gray-400 truncate">{l.url}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <BookmarksPanel />
      </div>
    </div>
  );
}

// keep TS quiet about unused import in some builds
export type { Profile };
