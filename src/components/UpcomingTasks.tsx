import { Calendar, Bell } from 'lucide-react';

export default function UpcomingTasks() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Calendar size={20} className="text-blue-600" />
          Upcoming Tasks (Next 7 Days)
        </h2>
        <button className="text-blue-500 hover:text-blue-700 text-sm font-medium flex items-center gap-1 transition-colors">
          <Bell size={14} />
          Reminder View
        </button>
      </div>

      {/* Empty State */}
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Calendar size={40} className="text-gray-400" />
        </div>
        <p className="text-gray-500 text-base font-medium">
          No upcoming tasks in the next 7 days
        </p>
        <p className="text-gray-400 text-sm mt-1">
          Tasks will appear here when they are scheduled
        </p>
      </div>
    </div>
  );
}
