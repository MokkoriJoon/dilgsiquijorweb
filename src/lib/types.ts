import { supabase } from './supabase';

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

/** The account that must always exist as SUPER_ADMIN (seeded via SQL script). */
export const PRIMARY_SUPER_ADMIN_EMAIL = 'calibojunfranz@gmail.com';

/**
 * Guarantee the primary account is a SUPER_ADMIN.
 *
 * Runs client-side after sign-in so the promotion also works when the Supabase
 * SQL seed script has not been applied yet (RLS lets a SUPER_ADMIN update every
 * profile, and users can always update their own row).
 */
export async function ensurePrimarySuperAdmin(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() !== PRIMARY_SUPER_ADMIN_EMAIL) return;

  await supabase
    .from('profiles')
    .update({ role: 'SUPER_ADMIN', updated_at: new Date().toISOString() })
    .eq('id', userId)
    .neq('role', 'SUPER_ADMIN');
}
