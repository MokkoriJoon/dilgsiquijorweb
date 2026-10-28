import { X } from 'lucide-react';
import { FREQUENCY_OPTIONS, frequencyLabel } from '../lib/taskMeta';
import type { TaskFrequency } from '../lib/types';

export type FreqFilter = TaskFrequency | null;

/**
 * Small selectable text buttons for filtering tasks by FREQUENCY.
 * Sits under the dashboard stat cards and combines with the status filter:
 * e.g. "Pending" card + "Daily" button  →  Pending AND Daily tasks.
 * Multiple frequencies can be active at once (OR between them).
 */
export default function FrequencyFilter({
  active,
  counts,
  onToggle,
  onClear,
}: {
  active: FreqFilter[];
  counts?: Partial<Record<TaskFrequency, number>> | null;
  onToggle: (f: TaskFrequency) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-6 -mt-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">
        Filter by frequency:
      </span>
      {FREQUENCY_OPTIONS.map((f) => {
        const isActive = active.includes(f);
        const count = counts?.[f];
        return (
          <button
            key={f}
            type="button"
            onClick={() => onToggle(f)}
            aria-pressed={isActive}
            title={`Show ${frequencyLabel(f)} tasks${isActive ? ' (click again to remove)' : ''}`}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              isActive
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            {frequencyLabel(f)}
            {typeof count === 'number' && (
              <span className={`ml-1 tabular-nums ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100"
          title="Remove all frequency filters"
        >
          <X size={11} /> Clear frequency
        </button>
      )}
    </div>
  );
}
