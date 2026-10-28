import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

export type StatFilter = 'all' | 'pending' | 'completed' | 'overdue';

interface Card {
  id: StatFilter;
  title: string;
  count: number;
  icon: any;
  iconBg: string;
  iconColor: string;
  ring: string;
}

/**
 * Dashboard cards — each card is clickable and filters the task list below.
 * Clicking the already-active card resets the filter (handled by onSelect).
 */
export default function StatsCards({
  stats,
  active,
  onSelect,
}: {
  stats: { total: number; pending: number; completed: number; overdue: number };
  active: StatFilter;
  onSelect: (f: StatFilter) => void;
}) {
  const cards: Card[] = [
    {
      id: 'all',
      title: 'Total Tasks',
      count: stats.total,
      icon: ClipboardList,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      ring: 'ring-blue-500',
    },
    {
      id: 'pending',
      title: 'Pending',
      count: stats.pending,
      icon: Clock,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      ring: 'ring-amber-500',
    },
    {
      id: 'completed',
      title: 'Complete',
      count: stats.completed,
      icon: CheckCircle2,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      ring: 'ring-green-500',
    },
    {
      id: 'overdue',
      title: 'Overdue',
      count: stats.overdue,
      icon: AlertTriangle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      ring: 'ring-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const isActive = active === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            aria-pressed={isActive}
            className={`text-left bg-white rounded-xl border p-5 flex items-center justify-between transition-all hover:shadow-md focus:outline-none ${
              isActive
                ? `shadow-md ring-2 ${card.ring} border-transparent`
                : 'border-gray-100 shadow-sm'
            }`}
          >
            <div>
              <p className="text-gray-500 text-sm font-medium">{card.title}</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{card.count}</p>
              <p
                className={`text-xs mt-2 font-medium ${
                  isActive ? 'text-gray-700' : 'text-blue-500'
                }`}
              >
                {isActive ? '✓ Filter active · click again to reset' : 'Click to filter'}
              </p>
            </div>
            <div className={`${card.iconBg} p-3 rounded-full`}>
              <card.icon className={card.iconColor} size={24} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
