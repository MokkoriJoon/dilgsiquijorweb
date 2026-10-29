import { Link, useOutletContext } from 'react-router-dom';
import { Folder, ChevronRight, Tags } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { colorNameFor } from '../lib/categoryColors';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Folder Categories — a quick "file cabinet" of every category. Each card is
 * a clickable folder: opening it lands on Task Management pre-filtered to
 * show ALL tasks under that category (org categories → repository; personal
 * categories → My Tasks). Admins can manage/create categories from the
 * "Task Categories" page.
 */
export default function FolderCategories() {
  const { profile } = useOutletContext<Ctx>();
  const t = useTasks(profile);

  if (t.loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
      </div>
    );
  }

  /** Build a folder link: org → TaskManagement?category, personal → MyTasks?category */
  function folderLink(catId: string, catName: string, isPersonal: boolean): string {
    const base = isPersonal ? '/app/tasks' : '/app/task-management';
    return `${base}?category=${encodeURIComponent(catId)}&name=${encodeURIComponent(catName)}`;
  }

  const folders = [
    ...t.orgCategories.map((c) => ({ cat: c, personal: false })),
    ...t.personalCategories.map((c) => ({ cat: c, personal: true })),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Folder size={24} className="text-amber-500" /> Folder Categories
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every category as a folder — click one to view{' '}
          <strong>all tasks under that category</strong>.
        </p>
      </div>

      {folders.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <p className="text-gray-500 font-medium">No categories yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            {t.orgCategories.length === 0 && t.personalCategories.length === 0
              ? 'Admins can create categories in “Task Categories”; you can also add personal ones there.'
              : ''}
          </p>
        </div>
      ) : (
        <>
          {/* Organization folders */}
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Tags size={14} className="text-blue-600" /> Organization Categories
            <span className="rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5 normal-case">
              {t.orgCategories.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {t.orgCategories.map((cat) => {
              const count = t.categoryTaskCount.get(cat.id) ?? 0;
              const c = cat.color ?? '#64748b';
              return (
                <Link
                  key={cat.id}
                  to={folderLink(cat.id, cat.name, false)}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all"
                  title={`View all ${count} task(s) in “${cat.name}”`}
                >
                  <span
                    className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${c}18`, color: c }}
                  >
                    <Folder size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-800 truncate group-hover:text-blue-700">
                      {cat.name}
                    </span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {count} task(s) · {colorNameFor(c)}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-gray-300 group-hover:text-blue-500 flex-shrink-0"
                  />
                </Link>
              );
            })}
            {t.orgCategories.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">
                No organization categories yet.
              </p>
            )}
          </div>

          {/* Personal folders */}
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Folder size={14} className="text-violet-600" /> My Personal Folders
            <span className="rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold px-2 py-0.5 normal-case">
              {t.personalCategories.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {t.personalCategories.map((cat) => {
              const count = t.categoryTaskCount.get(cat.id) ?? 0;
              const c = cat.color ?? '#64748b';
              return (
                <Link
                  key={cat.id}
                  to={folderLink(cat.id, cat.name, true)}
                  className="group bg-white rounded-xl border border-violet-100 shadow-sm p-4 flex items-center gap-3 hover:border-violet-300 hover:shadow-md transition-all"
                  title={`View all ${count} personal task(s) in “${cat.name}”`}
                >
                  <span
                    className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${c}18`, color: c }}
                  >
                    <Folder size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-800 truncate group-hover:text-violet-700">
                      {cat.name}
                    </span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {count} personal task(s) · Private
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-gray-300 group-hover:text-violet-500 flex-shrink-0"
                  />
                </Link>
              );
            })}
            {t.personalCategories.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">
                No personal categories yet — create one in “Task Categories”.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
