import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile, Task } from '../lib/types';
import {
  effectiveStatus,
  daysUntilDeadline,
} from '../lib/recurrence';
import { StatusBadge, FrequencyBadge } from '../components/TaskBadges';
import PublicViewBanner from '../components/PublicViewBanner';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Users,
  Link2,
} from 'lucide-react';

interface Stats {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

/**
 * PUBLIC dashboard — reads live task data (anon SELECT is allowed by RLS) and
 * refreshes automatically. Priority order: OVERDUE first (with the staff
 * assigned), then tasks due within 1 day, then within 3 days.
 */
export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [{ data: taskData }, { data: profileData }] = await Promise.all([
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('id,full_name,role'),
      ]);
      if (!mounted) return;
      if (taskData) {
        // Roll recurring deadlines forward locally for display accuracy.
        const now = new Date();
        const rolled = (taskData as Task[]).map((t) => {
          if (
            t.status !== 'completed' &&
            t.frequency !== 'one-time' &&
            t.due_date &&
            new Date(t.next_due_date ?? t.due_date).getTime() < now.getTime()
          ) {
            const next = nextOccurrenceLocal(t, now);
            if (next) return { ...t, next_due_date: next.toISOString() };
          }
          return t;
        });
        setTasks(rolled);
      }
      if (profileData) setProfiles(profileData as Profile[]);
      setUpdatedAt(new Date());
      setLoading(false);
    }

    load();
    // Auto-refresh so the public page always reflects admin changes.
    const interval = setInterval(load, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const stats: Stats = useMemo(() => {
    let pending = 0;
    let completed = 0;
    let overdue = 0;
    tasks.forEach((t) => {
      const s = effectiveStatus(t);
      if (s === 'completed') completed++;
      else if (s === 'overdue') overdue++;
      else pending++;
    });
    return { total: tasks.length, pending, completed, overdue };
  }, [tasks]);

  // Priority buckets: overdue → due today/1 day → due in 3 days.
  const groups = useMemo(() => {
    const open = tasks.filter((t) => effectiveStatus(t) !== 'completed');
    const overdue = open
      .filter((t) => effectiveStatus(t) === 'overdue')
      .sort((a, b) =>
        String(a.next_due_date ?? a.due_date).localeCompare(
          String(b.next_due_date ?? b.due_date),
        ),
      );
    const in1 = open.filter((t) => {
      const d = daysUntilDeadline(t);
      return effectiveStatus(t) === 'pending' && d !== null && d <= 1;
    });
    const in3 = open.filter((t) => {
      const d = daysUntilDeadline(t);
      return effectiveStatus(t) === 'pending' && d !== null && d > 1 && d <= 3;
    });
    return { overdue, in1, in3 };
  }, [tasks]);

  const cards = [
    { title: 'Total Tasks', value: stats.total, icon: ClipboardList, bg: 'bg-blue-100', fg: 'text-blue-600' },
    { title: 'Pending', value: stats.pending, icon: Clock, bg: 'bg-amber-100', fg: 'text-amber-600' },
    { title: 'Complete', value: stats.completed, icon: CheckCircle2, bg: 'bg-green-100', fg: 'text-green-600' },
    { title: 'Overdue', value: stats.overdue, icon: AlertTriangle, bg: 'bg-red-100', fg: 'text-red-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PublicViewBanner />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((c) => (
            <div
              key={c.title}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between"
            >
              <div>
                <p className="text-gray-500 text-sm font-medium">{c.title}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{c.value}</p>
              </div>
              <div className={`${c.bg} p-3 rounded-full`}>
                <c.icon className={c.fg} size={24} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Priority list: Overdue → 1 day → 3 days */}
          <div className="lg:col-span-2 space-y-6">
            <PrioritySection
              title="Overdue Tasks"
              subtitle="Past deadline — shown first, with the staff responsible"
              badgeCls="bg-red-100 text-red-700"
              icon={<AlertTriangle size={18} className="text-red-500" />}
              loading={loading}
              tasks={groups.overdue}
              profileById={profileById}
            />
            <PrioritySection
              title="Due Within 1 Day"
              subtitle="Deadlines today or tomorrow"
              badgeCls="bg-amber-100 text-amber-700"
              icon={<Clock size={18} className="text-amber-500" />}
              loading={loading}
              tasks={groups.in1}
              profileById={profileById}
            />
            <PrioritySection
              title="Due Within 3 Days"
              subtitle="Coming up this week"
              badgeCls="bg-yellow-100 text-yellow-700"
              icon={<CalendarDays size={18} className="text-yellow-600" />}
              loading={loading}
              tasks={groups.in3}
              profileById={profileById}
            />
          </div>

          {/* Side panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Overview</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-gray-500">Open tasks</span>
                  <span className="font-semibold text-gray-800">
                    {stats.pending + stats.overdue}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-500">Completed</span>
                  <span className="font-semibold text-gray-800">{stats.completed}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-500">Staff members</span>
                  <span className="font-semibold text-gray-800">{profiles.length}</span>
                </li>
              </ul>
              {updatedAt && (
                <p className="text-[11px] text-gray-400 mt-4">
                  Live data · last refreshed{' '}
                  {updatedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · auto-updates every 30s
                </p>
              )}
            </div>

            <div className="bg-blue-900 rounded-xl shadow-sm p-6 text-white">
              <h3 className="font-semibold text-lg mb-2">DILG Siquijor</h3>
              <p className="text-blue-200 text-sm leading-relaxed">
                This public board shows office-wide workload priorities. Sign in to manage your
                assignments, resource links and bookmarks.
              </p>
              <Link
                to="/login"
                className="inline-block mt-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Staff Login
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PrioritySection({
  title,
  subtitle,
  badgeCls,
  icon,
  loading,
  tasks,
  profileById,
}: {
  title: string;
  subtitle: string;
  badgeCls: string;
  icon: ReactNode;
  loading: boolean;
  tasks: Task[];
  profileById: Map<string, Profile>;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          {icon} {title}
        </h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeCls}`}>
          {tasks.length}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Nothing here right now ✔</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {tasks.map((t) => {
            const assignees = (t.assignee_ids ?? [])
              .map((id) => profileById.get(id))
              .filter(Boolean) as Profile[];
            return (
              <li key={t.id} className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  <StatusBadge task={t} />
                  <FrequencyBadge task={t} />
                  {(t.links?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                      <Link2 size={11} /> {t.links!.length} link{(t.links!.length ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={12} /> Due{' '}
                    {formatDate(t.next_due_date ?? t.due_date)}
                  </span>
                  {assignees.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {assignees.map((a) => a.full_name ?? 'Staff').join(', ')}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(d: string | null): string {
  if (!d) return 'No due date';
  try {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/** Local roll-forward mirror of the recurrence engine (display only). */
function nextOccurrenceLocal(task: Task, now: Date): Date | null {
  if (task.frequency === 'one-time') return null;
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const addMonths = (d: Date, n: number) => {
    const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), lastDay));
    return r;
  };
  let candidate = new Date(task.last_occurrence_date ?? task.due_date ?? now);
  for (let i = 0; i < 3660; i++) {
    let next: Date;
    switch (task.frequency) {
      case 'daily': {
        if (task.weekdays && task.weekdays.length > 0) {
          next = addDays(candidate, 1);
          for (let j = 0; j < 14 && !task.weekdays.includes(next.getDay()); j++) {
            next = addDays(next, 1);
          }
        } else next = addDays(candidate, 1);
        break;
      }
      case 'weekly':
        next = addDays(candidate, 7);
        break;
      case 'monthly':
        next = addMonths(candidate, 1);
        break;
      case 'quarterly':
        next = addMonths(candidate, 3);
        break;
      case 'semester':
        next = addMonths(candidate, 6);
        break;
      case 'yearly':
        next = addMonths(candidate, 12);
        break;
      default:
        return null;
    }
    if (next > now) return next;
    candidate = next;
  }
  return null;
}
