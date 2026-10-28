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

export type TaskStatus = 'pending' | 'in-progress' | 'completed';

export type TaskFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semester'
  | 'yearly'
  | 'one-time';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  frequency: TaskFrequency;
  status: TaskStatus;
  assigned_to: string;
  assigned_by: string | null;
  created_at?: string;
  updated_at?: string;
  assignee?: Pick<Profile, 'full_name' | 'position' | 'role'> | null;
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
