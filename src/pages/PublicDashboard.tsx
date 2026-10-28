import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  AlertTriangle,
  Clock,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Users,
  LogIn,
  Search,
} from 'lucide-react';
import { usePublicDashboard } from '../lib/usePublicDashboard';
import { useSiteBranding } from '../lib/siteSettings';
import { STATUS_META } from '../lib/taskMeta';
import { formatDueDate } from '../lib/useTasks';
import type { Task } from '../lib/types';

/**
 * Public Viewing Dashboard — NO login required.
 *  • Shows REAL data and updates automatically (Supabase Realtime + 60s poll).
 *  • Priority order: Overdue → due within 1 day → within 3 days → everything else.
 *  • Only Complete / Pending / Overdue statuses are used everywhere.
 */
export default function PublicDashboard() {
  const { branding } = useSiteBranding();
  const pub = usePublicDashboard();
  const [q, setQ] = useState('');

  const buckets = useMemo(() => {
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
      (t) => matches(t) && !overdue.includes(t) && !soon.includes(t) && !mid.includes(t),
    );
    return { overdue, soon, mid, rest };
  }, [pub.prioritized, pub.statusOf, q]);

  const completedCount = pub.stats.completed;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-white p-1.5 flex-shrink-0 overflow-hidden shadow">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
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
            <button
              onClick={pub.refetch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 text-sm font-medium"
              title="Refresh now"
            >
              <RefreshCw size={14} className={pub.loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-blue-950 px-3 py-2 text-sm font-bold"
            >
              <LogIn size={14} /> Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {pub.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} /> Could not load tasks ({pub.error}). Make sure the Supabase
            schema is applied and public read access is enabled.
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Tasks" value={pub.stats.total} tone="bg-slate-800" icon={<Users size={18} />} />
          <SummaryCard label="Overdue" value={pub.stats.overdue} tone="bg-red-600" icon={<AlertTriangle size={18} />} />
          <SummaryCard label="Pending" value={pub.stats.pending} tone="bg-amber-500" icon={<Clock size={18} />} />
          <SummaryCard label="Complete" value={completedCount} tone="bg-green-600" icon={<CheckCircle2 size={18} />} />
        </div>

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
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
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
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`${tone} text-white rounded-xl p-4 flex items-center justify-between shadow`}>
      <div>
        <p className="text-white/80 text-xs font-medium">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <div className="bg-white/15 rounded-full p-2.5">{icon}</div>
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
              {(t.links?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {t.links!.map((l) => (
                    <a
                      key={l.id}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <ExternalLink size={10} />
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
