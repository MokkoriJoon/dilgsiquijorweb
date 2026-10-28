import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useTasks, formatDueDate } from '../lib/useTasks';
import { useCategories } from '../lib/useCategories';
import type { Profile, Task, TaskCategory } from '../lib/types';
import { ROLE_LABELS } from '../lib/types';
import {
  effectiveStatus,
  daysUntilDeadline,
} from '../lib/recurrence';
import { StatusBadge, CategoryBadge, FrequencyBadge } from '../components/TaskBadges';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Users,
  CalendarDays,
  X,
  ListChecks,
  Link2,
} from 'lucide-react';

interface Stats {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

type Filter = 'all' | 'pending' | 'completed' | 'overdue';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All tasks',
  pending: 'Pending',
  completed: 'Complete',
  overdue: 'Overdue',
};

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  active,
  onClick,
}: {
  title: string;
  value: number;
  icon: any;
  iconBg: string;
  iconColor: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Click to filter: ${title}`}
      className={`text-left bg-white rounded-xl shadow-sm border p-5 flex items-center justify-between transition-all hover:shadow-md focus:outline-none ${
        active ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-100'
      }`}
    >
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
        <p className="text-[11px] text-blue-500 mt-1">
          {active ? '● Filtering — click to clear' : 'Click to filter'}
        </p>
      </div>
      <div className={`${iconBg} p-3 rounded-full`}>
        <Icon className={iconColor} size={24} />
      </div>
    </button>
  );
}

function TaskRow({
  task,
  profileById,
  showAssignees,
  category,
}: {
  task: Task;
  profileById: Map<string, Profile>;
  showAssignees: boolean;
  category?: TaskCategory | null;
}) {
  const assignees = (task.assignee_ids ?? [])
    .map((id) => profileById.get(id))
    .filter(Boolean) as Profile[];
  const linkCount = (task.links ?? []).length;
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`text-sm font-medium truncate ${
              effectiveStatus(task) === 'completed'
                ? 'text-gray-400 line-through'
                : 'text-gray-800'
            }`}
          >
            {task.title}
          </p>
          <StatusBadge task={task} />
          <CategoryBadge category={category ?? null} />
          <FrequencyBadge task={task} />
          {linkCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium">
              <Link2 size={11} /> {linkCount}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <CalendarDays size={12} />{' '}
            {formatDueDate(task.next_due_date ?? task.due_date)}
          </span>
          {showAssignees && assignees.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={12} />
              {assignees.map((a) => a.full_name ?? 'Staff').join(', ')}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export default function AppDashboard() {
  const { profile, isAdminOrAbove } = useAuth();
  const { myTasks, tasks, profileById, stats, loading } = useTasks(profile);
  const { categories, categoryById } = useCategories();

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<Filter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const canAssign = isAdminOrAbove;
  const scopedTasks = scope === 'all' && canAssign ? tasks : myTasks;
  const activeStats: Stats = scope === 'all' && canAssign ? stats.all : stats.mine;

  const filtered = useMemo(() => {
    let list = scopedTasks;
    if (filter !== 'all') list = list.filter((t) => effectiveStatus(t) === filter);
    if (categoryFilter !== 'all') {
      list =
        categoryFilter === 'none'
          ? list.filter((t) => !t.category_id)
          : list.filter((t) => t.category_id === categoryFilter);
    }
    return list;
  }, [scopedTasks, filter, categoryFilter]);

  // Priority queue for the "Needs Attention" panel:
  // Overdue first → due within 1 day → due within 3 days.
  const attentionGroups = useMemo(() => {
    const open = scopedTasks.filter((t) => effectiveStatus(t) !== 'completed');
    const overdue = open.filter((t) => effectiveStatus(t) === 'overdue');
    const in1 = open.filter(
      (t) => effectiveStatus(t) === 'pending' && daysUntilDeadline(t) === 1,
    );
    const in3 = open.filter((t) => {
      const d = daysUntilDeadline(t);
      return effectiveStatus(t) === 'pending' && d !== null && d > 1 && d <= 3;
    });
    return { overdue, in1, in3 };
  }, [scopedTasks]);

  const attentionTotal =
    attentionGroups.overdue.length +
    attentionGroups.in1.length +
    attentionGroups.in3.length;

  if (!profile) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome, {profile.full_name?.split(' ')[0] ?? 'Staff'} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ROLE_LABELS[profile.role]} · DILG Siquijor Provincial Office
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

      {/* Scope toggle + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => {
            setScope('mine');
            setFilter('all');
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            scope === 'mine'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <ClipboardList size={15} /> My Tasks
        </button>
        {canAssign && (
          <button
            onClick={() => {
              setScope('all');
              setFilter('all');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              scope === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Users size={15} /> All Staff Tasks
          </button>
        )}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="ml-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Clickable stat cards → filter view */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          title="Total Tasks"
          value={activeStats.total}
          icon={ClipboardList}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatCard
          title="Pending"
          value={activeStats.pending}
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          active={filter === 'pending'}
          onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        />
        <StatCard
          title="Complete"
          value={activeStats.completed}
          icon={CheckCircle2}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          active={filter === 'completed'}
          onClick={() => setFilter(filter === 'completed' ? 'all' : 'completed')}
        />
        <StatCard
          title="Overdue"
          value={activeStats.overdue}
          icon={AlertTriangle}
          iconBg="bg-red-100"
          iconColor="text-red-600"
          active={filter === 'overdue'}
          onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
        />
      </div>

      {filter !== 'all' && (
        <div className="flex items-center gap-2 mb-6 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full px-3 py-1 font-medium">
            Filtering: {FILTER_LABEL[filter]} ({filtered.length})
            <button
              onClick={() => setFilter('all')}
              className="hover:text-blue-900"
              title="Clear filter"
            >
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      {/* Needs Attention — Overdue → 1 day → 3 days */}
      {!loading && attentionTotal > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" /> Needs Attention
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Overdue tasks first, then deadlines within 1 day and within 3 days — with the staff
            assigned to each.
          </p>

          {[
            {
              key: 'overdue',
              label: `Overdue (${attentionGroups.overdue.length})`,
              cls: 'bg-red-50 text-red-700 border-red-200',
              items: attentionGroups.overdue,
            },
            {
              key: 'd1',
              label: `Due within 1 day (${attentionGroups.in1.length})`,
              cls: 'bg-amber-50 text-amber-700 border-amber-200',
              items: attentionGroups.in1,
            },
            {
              key: 'd3',
              label: `Due within 3 days (${attentionGroups.in3.length})`,
              cls: 'bg-yellow-50 text-yellow-700 border-yellow-200',
              items: attentionGroups.in3,
            },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.key} className="mb-4 last:mb-0">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${g.cls}`}
                >
                  {g.label}
                </span>
                <div className="mt-1 pl-1">
                  {g.items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      profileById={profileById}
                      showAssignees
                      category={categoryById.get(t.category_id ?? '')}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Task list (respects card filter) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <ListChecks size={18} className="text-blue-600" />
          {filter === 'all' ? 'Upcoming & Open Tasks' : `${FILTER_LABEL[filter]} Tasks`}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {scope === 'mine'
            ? 'Your open assignments (overdue shown first)'
            : 'Open assignments across all staff (overdue shown first)'}
        </p>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <CalendarDays size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">
              {filter === 'all' ? 'No upcoming tasks' : `No ${FILTER_LABEL[filter].toLowerCase()} tasks`}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {canAssign
                ? 'Use “Assign Task” to create one for a staff member.'
                : 'Tasks assigned to you will appear here.'}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                profileById={profileById}
                showAssignees={scope === 'all' || canAssign}
                category={categoryById.get(t.category_id ?? '')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
