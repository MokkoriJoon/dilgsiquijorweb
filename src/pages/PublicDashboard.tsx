import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  CalendarClock,
  CheckCircle2,
  Users,
  LogIn,
  UserPlus,
  Search,
  FolderOpen,
  Folder,
  ArrowLeft,
  X,
} from 'lucide-react';
import { usePublicDashboard } from '../lib/usePublicDashboard';
import type { AssignmentSlice } from '../lib/usePublicDashboard';
import { resolveTaskStatus } from '../lib/recurrence';
import { useAuth } from '../lib/useAuth';
import { useSiteBranding } from '../lib/siteSettings';
import { STATUS_META, FREQUENCY_OPTIONS, frequencyLabel } from '../lib/taskMeta';
import { formatDueDate } from '../lib/useTasks';
import type { Task, TaskFrequency } from '../lib/types';

/** Status-card filter used by the clickable dashboard cards. */
type PubFilter = 'all' | 'pending' | 'completed' | 'overdue';

/**
 * Public Viewing Dashboard — NO login required.
 *  • Shows REAL data and updates automatically (Supabase Realtime + 60s poll).
 *  • Counts are PER ASSIGNMENT: a task assigned to N users counts as N total
 *    tasks and lands in each assignee's own status bucket (Complete only once
 *    that user certified; Overdue while their deadline passed uncertified).
 *  • The four summary cards are CLICKABLE — they filter the assignment list
 *    shown directly BELOW the cards (no scrolling needed); click the active
 *    card again (or "Clear filter") to view all assignments again.
 *  • Priority order: Overdue → due within 1 day → within 3 days → everything else.
 *  • Only Complete / Pending / Overdue statuses are used everywhere.
 *  • Signed-in users who navigated here get a "Return" button instead of the
 *    Sign Up / Sign In buttons so they can go back to their session easily.
 */
export default function PublicDashboard() {
  const { branding } = useSiteBranding();
  const pub = usePublicDashboard();
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PubFilter>('all');

  /** Clicking the already-active card clears the filter (shows all again). */
  function handleCardSelect(f: PubFilter) {
    setFilter((prev) => (prev === f ? 'all' : f));
  }

  /** All (task, assignee) slices matching the active status card + search. */
  const filteredSlices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pub.slices.filter((s) => {
      if (filter !== 'all' && pub.sliceStatusOf(s) !== filter) return false;
      if (!needle) return true;
      return (
        s.task.title.toLowerCase().includes(needle) ||
        (s.task.category?.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [pub.slices, pub.sliceStatusOf, filter, q]);

  const buckets = useMemo(() => {
    // De-duplicate tasks across slices for the priority board below.
    const seen = new Set<string>();
    const matches = (t: Task) =>
      !q.trim() ||
      t.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      (t.category?.name ?? '').toLowerCase().includes(q.trim().toLowerCase());

    const overdue = pub.prioritized.filter((t) => pub.statusOf(t) === 'overdue' && matches(t));
    const soon = pub.prioritized.filter((t) => {
      if (!matches(t) || pub.statusOf(t) !== 'pending') return false;
      const d = daysUntilDue(t);
      return d !== null && d <= 1;
    });
    const mid = pub.prioritized.filter((t) => {
      if (!matches(t) || pub.statusOf(t) !== 'pending') return false;
      const d = daysUntilDue(t);
      return d !== null && d > 1 && d <= 3;
    });
    const rest = pub.prioritized.filter(
      (t) =>
        matches(t) &&
        !seen.has(t.id) &&
        !overdue.includes(t) &&
        !soon.includes(t) &&
        !mid.includes(t),
    );
    [...overdue, ...soon, ...mid, ...rest].forEach((t) => seen.add(t.id));
    return { overdue, soon, mid, rest };
  }, [pub.prioritized, pub.statusOf, q]);

  const completedCount = pub.stats.completed;
  const filtersActive = filter !== 'all';

  return (
    // Sticky-footer layout: flex column, main grows, footer sits at the bottom
    // even when there is little content (it no longer "floats" mid-screen).
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-white p-1.5 flex-shrink-0 overflow-hidden shadow">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Broken logo URL → fall back to the DILG badge instead of
                    // leaving an empty white circle.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-900 flex items-center justify-center">
                  <span className="text-white font-bold text-[10px]">DILG</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-wide truncate">{branding.name}</h1>
              <p className="text-blue-200 text-xs sm:text-sm leading-snug">
                {branding.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* NOTE: the manual Refresh button was removed — the board already
                updates automatically via Supabase Realtime + a 60s poll. */}
            {/* Still signed in? Show a RETURN button instead of Sign Up / Sign
                In — visiting this public board never logs anyone out, so the
                button simply goes back to the logged-in session page. */}
            {!authLoading && profile ? (
              <button
                onClick={() => navigate('/app/dashboard')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-blue-950 px-3 py-2 text-sm font-bold"
                title={`Return to your session as ${profile.full_name ?? 'Staff Member'}`}
              >
                <ArrowLeft size={14} /> Return
              </button>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-blue-950 px-3 py-2 text-sm font-bold"
                >
                  <UserPlus size={14} /> Sign Up
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-blue-950 px-3 py-2 text-sm font-bold"
                >
                  <LogIn size={14} /> Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {pub.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} /> Could not load tasks ({pub.error}). Make sure the Supabase
            schema is applied and public read access is enabled.
          </div>
        )}

        {/* Summary strip — every card is a clickable status FILTER. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <SummaryCard
            label="Total Tasks"
            value={pub.stats.total}
            tone="bg-slate-800"
            icon={<Users size={18} />}
            active={filter === 'all'}
            inactiveHint="Click to show all assignments"
            onClick={() => handleCardSelect('all')}
          />
          <SummaryCard
            label="Overdue"
            value={pub.stats.overdue}
            tone="bg-red-600"
            icon={<AlertTriangle size={18} />}
            active={filter === 'overdue'}
            onClick={() => handleCardSelect('overdue')}
          />
          <SummaryCard
            label="Pending"
            value={pub.stats.pending}
            tone="bg-amber-500"
            icon={<Clock size={18} />}
            active={filter === 'pending'}
            onClick={() => handleCardSelect('pending')}
          />
          <SummaryCard
            label="Complete"
            value={completedCount}
            tone="bg-green-600"
            icon={<CheckCircle2 size={18} />}
            active={filter === 'completed'}
            onClick={() => handleCardSelect('completed')}
          />
        </div>

        {/* Active-filter bar + CLEAR — filters the list right below the cards. */}
        <div className="flex flex-wrap items-center gap-2 mb-6 min-h-[1.75rem]">
          <span className="text-[11px] text-gray-500">
            Counts are per assigned user — one task shared with 3 people counts as 3.
          </span>
          {filtersActive && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                Filter: {filter}
                <button onClick={() => setFilter('all')} title="Remove status filter">
                  <X size={11} />
                </button>
              </span>
              <button
                onClick={() => setFilter('all')}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
              >
                Clear filter — view all
              </button>
            </>
          )}
        </div>

        {/* ═══ FILTERED ASSIGNMENTS — directly under the cards, no scrolling ═══ */}
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 border-l-4 border-blue-500 pl-3 mb-3">
            {filter === 'all'
              ? `All task assignments (${filteredSlices.length})`
              : `${STATUS_META[filter].label} assignments (${filteredSlices.length})`}
          </h2>
          {filteredSlices.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 py-10 text-center">
              <p className="text-gray-500 font-medium text-sm">
                No {filter === 'all' ? '' : `${STATUS_META[filter].label.toLowerCase()} `}
                assignments match this view.
              </p>
              {filtersActive && (
                <p className="text-xs text-gray-400 mt-1">
                  Click the active card again or “Clear filter” to view all assignments.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSlices.map((s) => (
                <AssignmentRow key={`${s.task.id}-${s.user_id || 'unassigned'}`} slice={s} />
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-blue-600" />
            Live board — auto-refreshes when tasks change. Sorted by priority: Overdue first, then
            due within 1 day, then within 3 days.
          </p>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by title or category…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {pub.loading && pub.tasks.length === 0 ? (
          <div className="py-24 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-800" />
          </div>
        ) : (
          <div className="space-y-8">
            <Bucket
              title="Overdue — act immediately"
              accent="border-red-500"
              badge="bg-red-100 text-red-700"
              count={buckets.overdue.length}
              tasks={buckets.overdue}
              statusOf={pub.statusOf}
            />

            <Bucket
              title="Due within 1 day"
              accent="border-orange-500"
              badge="bg-orange-100 text-orange-700"
              count={buckets.soon.length}
              tasks={buckets.soon}
              statusOf={pub.statusOf}
            />
            <Bucket
              title="Due within 3 days"
              accent="border-amber-400"
              badge="bg-amber-100 text-amber-800"
              count={buckets.mid.length}
              tasks={buckets.mid}
              statusOf={pub.statusOf}
            />
            <Bucket
              title="Upcoming & on track"
              accent="border-blue-400"
              badge="bg-blue-100 text-blue-700"
              count={buckets.rest.length}
              tasks={buckets.rest}
              statusOf={pub.statusOf}
            />
            {pub.prioritized.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
                <p className="text-gray-500 font-medium">No open tasks right now.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Completed tasks stay in the system for the office report.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Folder-style frequency browser — pick a frequency "folder" to see
            every task that repeats on it (resource links are NOT shown). */}
        <FrequencyBrowser tasks={pub.tasks} statusOf={pub.statusOf} />
      </main>

      {/* Footer — pinned to the bottom by the flex layout above */}
      <footer className="mt-auto border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
        {branding.footerText} · Public viewing dashboard (read-only)
      </footer>
    </div>
  );
}

function daysUntilDue(t: Task): number | null {
  const due = (t.due_date ?? '').slice(0, 10);
  if (!due) return null;
  const dd = Math.round(
    (new Date(`${due}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) /
      86_400_000,
  );
  return dd;
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
  active = false,
  inactiveHint = 'Click to filter',
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  icon: ReactNode;
  /** True when this card is the currently active status filter. */
  active?: boolean;
  inactiveHint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Showing only ${label} — click again to view all` : `${inactiveHint} (${label})`}
      className={`${tone} text-white rounded-xl p-4 flex items-center justify-between shadow transition-all text-left w-full
        hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/70
        ${active ? 'ring-4 ring-white/60 scale-[1.02]' : ''}`}
    >
      <div>
        <p className="text-white/80 text-xs font-medium">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        <p className="text-[10px] mt-1 font-semibold text-white/75">
          {active ? '✓ Filter active · click again to clear' : inactiveHint}
        </p>
      </div>
      <div className="bg-white/15 rounded-full p-2.5">{icon}</div>
    </button>
  );
}

/** Effective status of one assignment slice (mirrors usePublicDashboard). */
function sliceStatus(s: AssignmentSlice): 'completed' | 'pending' | 'overdue' {
  if (s.completed || s.task.status === 'completed') return 'completed';
  return resolveTaskStatus(s.task);
}

/**
 * One (task, assignee) slice rendered under the summary cards — the unit of
 * the public per-assignment counting. Shows WHO owns the slice and whether
 * THEIR part is Complete / Pending / Overdue.
 */
function AssignmentRow({ slice }: { slice: AssignmentSlice }) {
  const st = sliceStatus(slice);
  const meta = STATUS_META[st];
  const t = slice.task;
  const profile = (t.assignee_profiles ?? []).find((p) => p.id === slice.user_id);
  const name = profile?.full_name ?? (slice.user_id ? 'Staff' : 'Unassigned');
  const others = (t.assignee_profiles ?? []).filter((p) => p.id !== slice.user_id);

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-4 ${
        st === 'overdue' ? 'border-red-200' : st === 'completed' ? 'border-green-200' : 'border-gray-100'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {t.category && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              color: t.category.color ?? '#64748b',
              backgroundColor: `${t.category.color ?? '#64748b'}18`,
            }}
          >
            {t.category.name}
          </span>
        )}
        {t.frequency !== 'one-time' && (
          <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-700 capitalize">
            {frequencyLabel(t.frequency)}
          </span>
        )}
      </div>
      <h3
        className={`font-semibold text-gray-800 text-sm leading-snug ${
          st === 'completed' ? 'line-through text-gray-400' : ''
        }`}
      >
        {t.title}
      </h3>
      <p className="text-xs text-gray-500 mt-1">Due: {formatDueDate(t.due_date)}</p>
      <p className="text-xs text-gray-700 mt-2 flex items-center gap-1 flex-wrap">
        <Users size={12} className="text-gray-400" />
        <span className="font-semibold">{name}</span>
        <span className="text-gray-400">· their part:</span>
        <span
          className={
            st === 'completed'
              ? 'text-green-700 font-medium'
              : st === 'overdue'
                ? 'text-red-600 font-medium'
                : 'text-amber-700 font-medium'
          }
        >
          {st === 'completed' ? 'Done ✓' : st === 'overdue' ? 'Overdue' : 'Not yet done'}
        </span>
        {others.length > 0 && (
          <span className="text-[10px] text-gray-400" title={`Also assigned: ${others.map((p) => p.full_name ?? 'Staff').join(', ')}`}>
            (+{others.length} other{others.length === 1 ? '' : 's'})
          </span>
        )}
      </p>
    </div>
  );
}

function Bucket({
  title,
  accent,
  badge,
  count,
  tasks,
  statusOf,
}: {
  title: string;
  accent: string;
  badge: string;
  count: number;
  tasks: Task[];
  statusOf: (t: Task) => 'completed' | 'pending' | 'overdue';
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className={`text-sm font-bold uppercase tracking-wide text-gray-700 border-l-4 ${accent} pl-3 mb-3`}>
        {title}{' '}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${badge}`}>{count}</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tasks.map((t) => {
          const st = statusOf(t);
          const meta = STATUS_META[st];
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                {t.category && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: t.category.color ?? '#64748b',
                      backgroundColor: `${t.category.color ?? '#64748b'}18`,
                    }}
                  >
                    {t.category.name}
                  </span>
                )}
                {t.frequency !== 'one-time' && (
                  <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-700 capitalize">
                    {t.frequency}
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-800 text-sm leading-snug">{t.title}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Due: {formatDueDate(t.due_date)}
              </p>
              <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                <Users size={12} className="text-gray-400" />
                {(t.assignee_profiles ?? [])
                  .map((p) => p.full_name ?? 'Staff')
                  .slice(0, 3)
                  .join(', ') || 'Unassigned'}
                {(t.assignee_profiles?.length ?? 0) > 3 && ` +${t.assignee_profiles!.length - 3}`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Folder-style frequency browser shown at the bottom of the public board.
 * Each frequency is a "folder"; clicking it lists every task that repeats on
 * that cadence — WITHOUT any resource links (public viewers can't open them).
 */
function FrequencyBrowser({
  tasks,
  statusOf,
}: {
  tasks: Task[];
  statusOf: (t: Task) => 'completed' | 'pending' | 'overdue';
}) {
  const [selected, setSelected] = useState<TaskFrequency | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<TaskFrequency, Task[]>();
    FREQUENCY_OPTIONS.forEach((f) => map.set(f, []));
    tasks.forEach((t) => {
      const f = (t.frequency ?? 'one-time') as TaskFrequency;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(t);
    });
    return map;
  }, [tasks]);

  const selectedTasks = selected ? grouped.get(selected) ?? [] : [];

  return (
    <section className="mt-10">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 border-l-4 border-indigo-500 pl-3 mb-3">
        Browse tasks by frequency
      </h2>

      {/* Folder tabs */}
      <div className="flex flex-wrap gap-2">
        {FREQUENCY_OPTIONS.map((f) => {
          const count = grouped.get(f)?.length ?? 0;
          const active = selected === f;
          return (
            <button
              key={f}
              onClick={() => setSelected(active ? null : f)}
              disabled={count === 0}
              title={count === 0 ? 'No tasks in this folder' : `Show all ${frequencyLabel(f)} tasks`}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition
                ${
                  active
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow'
                    : count === 0
                      ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
            >
              {active ? <FolderOpen size={16} /> : <Folder size={16} />}
              {frequencyLabel(f)}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected folder contents */}
      {selected ? (
        selectedTasks.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">This folder is empty.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {selectedTasks.map((t) => {
              const st = statusOf(t);
              const meta = STATUS_META[st];
              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                >
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      {t.category && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            color: t.category.color ?? '#64748b',
                            backgroundColor: `${t.category.color ?? '#64748b'}18`,
                          }}
                        >
                          {t.category.name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-800 text-sm leading-snug">{t.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">Due: {formatDueDate(t.due_date)}</p>
                    <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                      <Users size={12} className="text-gray-400" />
                      {(t.assignee_profiles ?? [])
                        .map((p) => p.full_name ?? 'Staff')
                        .slice(0, 3)
                        .join(', ') || 'Unassigned'}
                      {(t.assignee_profiles?.length ?? 0) > 3 && ` +${t.assignee_profiles!.length - 3}`}
                    </p>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          Select a frequency folder above to view all tasks that repeat on that schedule.
        </p>
      )}
    </section>
  );
}
