import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useTasks, formatDueDate } from '../lib/useTasks';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';
import type { Profile, Task } from '../lib/types';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  Plus,
  Users,
  CalendarDays,
} from 'lucide-react';

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: number;
  icon: any;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${iconBg} p-3 rounded-full`}>
        <Icon className={iconColor} size={24} />
      </div>
    </div>
  );
}

function TaskRow({ task, assignee }: { task: Task; assignee?: Profile | null }) {
  const statusStyles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <CalendarDays size={12} /> {formatDueDate(task.due_date)}
          </span>
          {assignee && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[task.status] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {task.status.replace('-', ' ')}
            </span>
          )}
        </p>
      </div>
      {assignee && (
        <span
          className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 ${ROLE_BADGE_CLASSES[assignee.role]}`}
        >
          {ROLE_LABELS[assignee.role]}
        </span>
      )}
    </div>
  );
}

export default function AppDashboard() {
  const { profile } = useAuth();
  const { myTasks, tasks, profileById, stats, loading } = useTasks(profile);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');

  const canAssign = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN';

  const upcoming = useMemo(() => {
    const source = scope === 'mine' ? myTasks : tasks;
    return source
      .filter((t) => t.status !== 'completed')
      .slice(0, 7);
  }, [scope, myTasks, tasks]);

  if (!profile) return null;

  const activeStats: Stats = scope === 'mine' ? stats.mine : stats.all;

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome, <span className="font-medium">{profile.full_name}</span> •{' '}
            {ROLE_LABELS[profile.role]}
          </p>
        </div>
        {canAssign && (
          <Link
            to="/app/tasks?new=1"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start"
          >
            <Plus size={16} /> Assign Task
          </Link>
        )}
      </div>

      {/* Scope toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setScope('mine')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            scope === 'mine'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <ListChecks size={15} /> My Tasks
        </button>
        {canAssign && (
          <button
            onClick={() => setScope('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              scope === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Users size={15} /> All Staff Tasks
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Tasks"
          value={activeStats.total}
          icon={ClipboardList}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Pending"
          value={activeStats.pending + activeStats.inProgress}
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
        />
        <StatCard
          title="Completed"
          value={activeStats.completed}
          icon={CheckCircle2}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          title="Overdue"
          value={activeStats.overdue}
          icon={AlertTriangle}
          iconBg="bg-red-100"
          iconColor="text-red-600"
        />
      </div>

      {/* Upcoming list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Upcoming Tasks
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {scope === 'mine'
            ? 'Your open assignments'
            : 'Open assignments across all staff'}
        </p>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <CalendarDays size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No upcoming tasks</p>
            <p className="text-gray-400 text-xs mt-1">
              {canAssign
                ? 'Use “Assign Task” to create one for a staff member.'
                : 'Tasks assigned to you will appear here.'}
            </p>
          </div>
        ) : (
          <div>
            {upcoming.map((t) => (
              <TaskRow key={t.id} task={t} assignee={profileById.get(t.assigned_to)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
