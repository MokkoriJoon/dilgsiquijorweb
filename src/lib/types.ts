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
 * Stored task status. The UI only ever exposes three states:
 * Complete ('completed') · Pending ('pending') · Overdue (derived from the
 * due date / recurrence schedule — see `resolveTaskStatus` in lib/recurrence).
 */
export type TaskStatus = 'pending' | 'completed';

/** Status as displayed after overdue is derived. */
export type DisplayTaskStatus = 'pending' | 'completed' | 'overdue';

export type TaskFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semester'
  | 'yearly'
  | 'one-time';

/** A link/resource attached to a task that assignees can click. */
export interface TaskLink {
  id: string;
  task_id: string;
  label: string;
  url: string;
  created_at?: string;
}

/** Task Category (e.g. Reporting, Peace & Order) — DILG Siquijor Province. */
export interface TaskCategory {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  created_by: string | null;
  created_at?: string;
}

/** Personal bookmark / self-view resource link saved by any user. */
export interface Bookmark {
  id: string;
  user_id: string;
  label: string;
  url: string;
  note: string | null;
  created_at?: string;
}

export interface TaskAssignment {
  task_id: string;
  user_id: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  /** Template/anchor date for recurring tasks. */
  start_date: string | null;
  frequency: TaskFrequency;
  /** Weekdays for 'daily' recurrence. 0 = Monday … 6 = Sunday. */
  days_of_week: number[] | null;
  repeat_forever: boolean;
  status: TaskStatus;
  /** Legacy single-assignee column (kept in sync with assignments[0]). */
  assigned_to: string;
  assigned_by: string | null;
  category_id: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  completion_note?: string | null;
  completed_by?: string | null;
  assignee?: Pick<Profile, 'full_name' | 'position' | 'role'> | null;
  /** All users assigned to this task (multiple users per task). */
  assignees?: string[];
  assignee_profiles?: Profile[];
  links?: TaskLink[];
  category?: TaskCategory | null;
}

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
