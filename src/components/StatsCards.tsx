import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const stats = [
  {
    title: 'Total Tasks',
    count: 0,
    icon: ClipboardList,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Pending',
    count: 0,
    icon: Clock,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    title: 'Completed',
    count: 0,
    icon: CheckCircle2,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  {
    title: 'Overdue',
    count: 0,
    icon: AlertTriangle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
];

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center justify-between hover:shadow-md transition-shadow"
        >
          <div>
            <p className="text-gray-500 text-sm font-medium">{stat.title}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{stat.count}</p>
            <button className="text-blue-500 text-xs mt-2 hover:text-blue-700 transition-colors">
              Click to filter
            </button>
          </div>
          <div className={`${stat.iconBg} p-3 rounded-full`}>
            <stat.icon className={stat.iconColor} size={24} />
          </div>
        </div>
      ))}
    </div>
  );
}
