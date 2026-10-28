interface FilterTabsProps {
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
}

const filters = [
  { id: 'all', label: 'All Upcoming', icon: '' },
  { id: 'daily', label: 'Daily', icon: '🔄' },
  { id: 'weekly', label: 'Weekly', icon: '📅' },
  { id: 'monthly', label: 'Monthly', icon: '📅' },
  { id: 'quarterly', label: 'Quarterly', icon: '📊' },
  { id: 'semester', label: 'Semester', icon: '📅' },
  { id: 'yearly', label: 'Yearly', icon: '🎯' },
  { id: 'one-time', label: 'One-time', icon: '📌' },
];

export default function FilterTabs({ activeFilter, setActiveFilter }: FilterTabsProps) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === filter.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filter.icon && <span className="mr-1">{filter.icon}</span>}
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
