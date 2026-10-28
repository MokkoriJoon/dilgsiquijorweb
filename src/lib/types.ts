export type UserRole = 'STANDARD' | 'ADMIN' | 'SUPER_ADMIN';

export const USER_ROLES: UserRole[] = ['STANDARD', 'ADMIN', 'SUPER_ADMIN'];

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  /** Position / Designation of the staff member (formerly "Office / Department"). */
  position: string | null;
  role: UserRole;
  created_at?: string;
}

/**
 * Task statuses are limited to three values:
 *  - pending   : not yet completed and not past its deadline
 *  - completed : marked done by an assignee (with accountability acknowledgment)
 *  - overdue   : computed automatically when the deadline has passed
 */
export type TaskStatus = 'pending' | 'completed' | 'overdue';

export type TaskFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semester'
  | 'yearly'
  | 'one-time';

export const FREQUENCIES: TaskFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semester',
  'yearly',
  'one-time',
];

/** Day indexes follow JS Date.getDay(): 0 = Sunday … 6 = Saturday. */
export const WEEK_DAYS: { idx: number; short: string; long: string }[] = [
  { idx: 1, short: 'Mon', long: 'Monday' },
  { idx: 2, short: 'Tue', long: 'Tuesday' },
  { idx: 3, short: 'Wed', long: 'Wednesday' },
  { idx: 4, short: 'Thu', long: 'Thursday' },
  { idx: 5, short: 'Fri', long: 'Friday' },
  { idx: 6, short: 'Sat', long: 'Saturday' },
  { idx: 0, short: 'Sun', long: 'Sunday' },
];

export const WEEKDAY_MON_FRI = [1, 2, 3, 4, 5];
export const WEEKDAY_ALL = [0, 1, 2, 3, 4, 5, 6];

/** A clickable resource link attached to a task or saved as a personal bookmark. */
export interface ResourceLink {
  title: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  frequency: TaskFrequency;
  /** Selected days of the week — only meaningful when frequency === 'daily'. */
  weekdays: number[] | null;
  status: TaskStatus;
  /** Every user assigned to this task (multiple users allowed). */
  assignee_ids: string[];
  assigned_by: string | null;
  category_id: string | null;
  links: ResourceLink[] | null;
  completion_notes: string | null;
  completed_by: string | null;
  acknowledged_completion: boolean;
  completed_at: string | null;
  last_occurrence_date: string | null;
  next_due_date: string | null;
  occurrence_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string | null;
  created_at?: string;
}

/** Editable website identity settings (Super Admin only). */
export interface SiteSettings {
  id: number;
  site_name: string;
  site_description: string;
  logo_url: string | null;
  updated_at?: string;
}

export const DEFAULT_SITE_NAME = 'D.E.N.N.I.S';
export const DEFAULT_SITE_DESCRIPTION =
  'DILG Employee Navigation & Notices Information System — Siquijor Provincial Office';

/** Local fallback for personal bookmarks (per browser, keyed by user id). */
export const BOOKMARK_STORAGE_PREFIX = 'dennis_bookmarks_';

export const ROLE_LABELS: Record<UserRole, string> = {
  STANDARD: 'Standard',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

export const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  STANDARD: 'bg-gray-100 text-gray-700 border-gray-200',
  ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
};

export function isSuperAdmin(role?: UserRole | string | null): boolean {
  return role === 'SUPER_ADMIN';
}

export function isAdminOrAbove(role?: UserRole | string | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

// Role assignment is handled entirely in the database: the FIRST user who
// registers is automatically assigned SUPER_ADMIN by the handle_new_user()
// trigger (see supabase/schema.sql, section 3). No client-side bootstrap.
