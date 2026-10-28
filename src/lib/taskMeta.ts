/**
 * Shared UI helpers for task statuses, categories and badges.
 *
 * NOTE: this module is imported by `TaskBadges.tsx` together with
 * `./recurrence` — both files must exist or the production build fails
 * (Rollup: "Could not resolve ./recurrence from src/components/TaskBadges.tsx").
 */
import type { TaskFrequency, TaskStatus } from './types';

/** The only three task statuses used across the whole system. */
export const TASK_STATUSES = ['completed', 'pending', 'overdue'] as const;
export type EffectiveTaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_META: Record<
  EffectiveTaskStatus,
  { label: string; cls: string; dot: string; solid: string }
> = {
  completed: {
    label: 'Complete',
    cls: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
    solid: 'bg-green-600',
  },
  pending: {
    label: 'Pending',
    cls: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    solid: 'bg-amber-500',
  },
  overdue: {
    label: 'Overdue',
    cls: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
    solid: 'bg-red-600',
  },
};

/** Default task categories for DILG Siquijor Provincial Office. */
export const DEFAULT_CATEGORIES: { name: string; color: string; description: string }[] = [
  { name: 'Reporting', color: '#2563eb', description: 'Accomplishment reports, monthly/quarterly reports' },
  { name: 'Peace & Order', color: '#dc2626', description: 'Peace and order / public safety concerns' },
  { name: 'E-Governance', color: '#0891b2', description: 'Digital governance and systems support' },
  { name: 'Local Governance', color: '#7c3aed', description: 'LGU support, local development projects' },
  { name: 'Disaster Risk Reduction & Management', color: '#ea580c', description: 'DRRM activities and readiness' },
  { name: 'Citizen Participation', color: '#0d9488', description: 'PPM, KKK and other engagement programs' },
  { name: 'DILG Memoranda Circulars', color: '#4f46e5', description: 'Memoranda, circulars and issuances' },
  { name: 'Training & Development', color: '#ca8a04', description: 'Seminars, workshops and capability building' },
  { name: 'Administrative', color: '#64748b', description: 'Office administration and records' },
];

export const CATEGORY_COLORS = [
  '#2563eb', '#dc2626', '#0891b2', '#7c3aed', '#ea580c',
  '#0d9488', '#4f46e5', '#ca8a04', '#64748b', '#db2777',
  '#16a34a', '#0f172a',
];

export const FREQUENCY_OPTIONS: TaskFrequency[] = [
  'one-time',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semester',
  'yearly',
];

export function frequencyLabel(f?: TaskFrequency | string | null): string {
  if (!f) return 'One-time';
  return f === 'one-time' ? 'One-time' : f.charAt(0).toUpperCase() + f.slice(1).replace('-', ' ');
}

/** Stored status values are normalised to the 3-status model. */
export function normalizeStoredStatus(status?: string | null): TaskStatus {
  if (status === 'completed') return 'completed';
  return 'pending'; // legacy 'in-progress' collapses into 'pending'
}
