import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/types';
import { USER_ROLES, ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Search,
  ShieldCheck,
  CalendarDays,
  KeyRound,
  MailCheck,
} from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

interface UserFormState {
  id?: string;
  full_name: string;
  email: string;
  position: string;
  role: UserRole;
  password: string;
}

export default function UserManagement() {
  const { profile, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<UserFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  /* Content that belongs ONLY to the target and will be removed with the
     login (personal tasks / personal categories / bookmarks — STANDARD). */
  const [deleteImpact, setDeleteImpact] = useState<{ personalTasks: number; personalCategories: number; bookmarks: number } | null>(null);

  async function openDelete(user: Profile) {
    setDeleteTarget(user);
    setDeleteImpact(null);
    if (user.role !== 'STANDARD') return; // ADMIN/SUPER_ADMIN content is never deleted
    const [{ data: pt }, { data: pc }, { data: bm }] = await Promise.all([
      supabase.from('tasks').select('id').eq('is_personal', true).eq('owner_id', user.id),
      supabase.from('task_categories').select('id').eq('is_personal', true).eq('owner_id', user.id),
      supabase.from('bookmarks').select('id').eq('user_id', user.id),
    ]);
    setDeleteImpact({
      personalTasks: pt?.length ?? 0,
      personalCategories: pc?.length ?? 0,
      bookmarks: bm?.length ?? 0,
    });
  }

  /* ── Reset-password modal (key icon) ─────────────────────────────────── */
  const [pwTarget, setPwTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState('');

  function openResetPassword(user: Profile) {
    setPwTarget(user);
    setNewPassword('');
    setConfirmPassword('');
    setPwError('');
    setPwDone('');
  }

  async function sendResetLink() {
    if (!pwTarget) return;
    if (!pwTarget.email) {
      setPwError('This user has no email on file, so a reset link cannot be sent.');
      return;
    }
    setPwError('');
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(pwTarget.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) setPwError(error.message);
      else
        setPwDone(
          `A password-reset link was sent to ${pwTarget.email}. The user can use it on the login page (“Forgot Password?” flow) to choose a new password.`,
        );
    } catch {
      setPwError('Failed to send reset email. Please try again.');
    } finally {
      setPwBusy(false);
    }
  }

  async function setUserPasswordDirectly() {
    if (!pwTarget) return;
    setPwError('');
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      // SECURITY DEFINER RPC (see supabase/schema.sql): updates auth.users
      // directly so the Super Admin can set a temporary password for a user.
      const { error } = await supabase.rpc('admin_set_user_password', {
        p_user_id: pwTarget.id,
        p_password: newPassword,
      });
      if (error) {
        const m = error.message ?? '';
        setPwError(
          /admin_set_user_password|does not exist|function/i.test(m)
            ? 'The admin_set_user_password function is missing. Open Supabase → SQL Editor and run the function block from supabase/schema.sql once.'
            : m,
        );
      } else {
        setPwDone(
          `Password updated for ${pwTarget.full_name ?? pwTarget.email}. Share the new temporary password securely — the user should change it after signing in.`,
        );
        setNewPassword('');
        setConfirmPassword('');
      }
    } finally {
      setPwBusy(false);
    }
  }

  const loadUsers = async () => {
    setLoading(true);
    setPageError('');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: false })
      .order('full_name');
    if (error) {
      setPageError(error.message);
    } else {
      const list = (data ?? []) as Profile[];
      setUsers(list);

      // Open-task counts per user (nice-to-have; silently ignored on failure)
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('assigned_to,status');
      const counts: Record<string, number> = {};
      (taskRows ?? []).forEach((t: any) => {
        if (t.status !== 'completed') {
          counts[t.assigned_to] = (counts[t.assigned_to] ?? 0) + 1;
        }
      });
      setTaskCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          !query.trim() ||
          (u.full_name ?? '').toLowerCase().includes(query.toLowerCase()) ||
          (u.email ?? '').toLowerCase().includes(query.toLowerCase()) ||
          (u.position ?? '').toLowerCase().includes(query.toLowerCase()),
      ),
    [users, query],
  );

  function openCreate() {
    setFormError('');
    setForm({
      full_name: '',
      email: '',
      position: '',
      role: 'STANDARD',
      password: '',
    });
    setShowModal(true);
  }

  function openEdit(user: Profile) {
    setFormError('');
    setForm({
      id: user.id,
      full_name: user.full_name ?? '',
      email: user.email ?? '',
      position: user.position ?? '',
      role: user.role,
      password: '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form || !profile) return;
    setFormError('');

    if (!form.full_name.trim()) return setFormError('Full name is required.');
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return setFormError('A valid email is required.');
    if (!form.id && form.password.length < 8)
      return setFormError('Password must be at least 8 characters.');

    setSaving(true);
    let err: string | null = null;

    if (form.id) {
      // Update profile info + role (allowed by the SUPER_ADMIN RLS policy)
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          position: form.position.trim() || null,
          role: form.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.id);
      err = error?.message ?? null;
    } else {
      // Create auth user + profile via SECURITY DEFINER RPC
      const { error: rpcErr } = await supabase.rpc('admin_create_user', {
        p_email: form.email.trim().toLowerCase(),
        p_password: form.password,
        p_full_name: form.full_name.trim(),
        p_position: form.position.trim() || null,
        p_role: form.role,
      });
      // Friendly message for the most common DB errors
      if (rpcErr) {
        const m = rpcErr.message ?? '';
        if (/gen_salt|crypt|pgcrypto/i.test(m)) {
          err =
            'Database is missing the pgcrypto extension. Open Supabase → SQL Editor and run supabase/schema.sql once (it installs pgcrypto and recreates admin_create_user).';
        } else if (/duplicate key/i.test(m)) {
          err = 'That email is already registered.';
        } else {
          err = m;
        }
      }
    }

    setSaving(false);
    if (err) {
      setFormError(err);
      return;
    }
    setShowModal(false);
    setForm(null);
    loadUsers();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageError('');
    // Deletes the user's LOGIN (auth.users row in Supabase) completely.
    // Everything they made / edited on the website (org tasks, categories,
    // announcements…) is PRESERVED — attribution falls back to '—'.
    // STANDARD users additionally lose only their personal items.
    const { error } = await supabase.rpc('admin_delete_user', {
      p_user_id: deleteTarget.id,
    });
    setDeleting(false);
    if (error) {
      const m = error.message ?? '';
      setPageError(
        /admin_delete_user|does not exist|function|schema cache/i.test(m)
          ? 'The admin_delete_user function is missing. Open Supabase → SQL Editor and run supabase/schema.sql once (section 7c), then try again.'
          : m,
      );
      return;
    }
    setDeleteTarget(null);
    loadUsers();
  }

  if (!profile) return null;

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center max-w-lg mx-auto mt-10">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Access Denied</h2>
        <p className="text-gray-500 text-sm mt-2">
          Only <span className="font-semibold">SUPER_ADMIN</span> users can manage
          accounts and roles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={24} className="text-blue-600" /> User Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add staff, edit their details and roles, or remove accounts.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start"
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {pageError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start justify-between gap-2">
          <p className="text-red-700 text-sm">{pageError}</p>
          <button onClick={() => setPageError('')} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, or position…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Users size={40} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Position</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Open Tasks</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {(user.full_name ?? 'U')
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">
                            {user.full_name ?? '—'}
                            {user.id === profile.id && (
                              <span className="ml-2 text-[10px] text-blue-600 font-semibold">
                                (You)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{user.position ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ROLE_BADGE_CLASSES[user.role]}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {taskCounts[user.id] ?? 0}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openResetPassword(user)}
                          title="Forgot / change this user's password"
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(user)}
                          title="Edit user"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => openDelete(user)}
                          disabled={user.id === profile.id}
                          title={
                            user.id === profile.id
                              ? 'You cannot delete your own account'
                              : 'Delete user'
                          }
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
        <CalendarDays size={12} />
        Note: deleting a user removes their <span className="font-medium">login</span>{' '}
        completely (Supabase auth account included). Tasks, categories and
        announcements they created or edited are kept; only a STANDARD
        user&apos;s personal tasks, personal categories and bookmarks are removed.
      </p>

      {/* Create / Edit modal */}
      {showModal && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {form.id ? 'Edit User' : 'Add New User'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{formError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Junfranz Rock C. Calibo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="staff@dilg.gov.ph"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position / Designation
                </label>
                <input
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="e.g., Administrative Officer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} ({r})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  STANDARD — view/complete own tasks · ADMIN — assign &amp; manage all
                  tasks · SUPER_ADMIN — full user management
                </p>
              </div>
              {!form.id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporary Password *
                  </label>
                  <PasswordInput
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimum 8 characters"
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm pr-10"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {form.id ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset / change password modal (key icon) */}
      {pwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPwTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <KeyRound size={18} className="text-amber-600" />
                <span className="truncate">Reset Password</span>
              </h3>
              <button
                onClick={() => setPwTarget(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4 break-words">
              For <span className="font-semibold">{pwTarget.full_name ?? '—'}</span>{' '}
              <span className="text-gray-400">({pwTarget.email})</span>
            </p>

            {pwError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm break-words">{pwError}</p>
              </div>
            )}
            {pwDone && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-green-700 text-sm break-words">{pwDone}</p>
              </div>
            )}

            {/* Option 1 — email a reset link (forgot-password flow) */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">
                Send password-reset email
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                The user receives a link to choose a new password themselves (same flow as
                “Forgot Password?” on the login page).
              </p>
              <button
                onClick={sendResetLink}
                disabled={pwBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
              >
                {pwBusy ? <Loader2 size={15} className="animate-spin" /> : <MailCheck size={15} />}
                Send Reset Link
              </button>
            </div>

            {/* Option 2 — set a new temporary password directly */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">
                Set a new password directly
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Creates a temporary password you can share with the user securely.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    New Password *
                  </label>
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm pr-10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Confirm Password *
                  </label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter the new password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm pr-10"
                  />
                </div>
                <button
                  onClick={setUserPasswordDirectly}
                  disabled={pwBusy || !newPassword || !confirmPassword}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {pwBusy && <Loader2 size={15} className="animate-spin" />}
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800">Delete user&apos;s login?</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium">{deleteTarget.full_name}</span> ({deleteTarget.email})
              will be <span className="font-semibold text-red-600">completely removed from
              Supabase</span> and can no longer sign in. This cannot be undone.
            </p>
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">What happens to their content?</p>
              <p>
                • {deleteTarget.role === 'STANDARD' ? (
                    <>Personal tasks, personal categories and bookmarks of this{' '}
                    <span className="font-semibold">Standard</span> user are deleted.</>
                  ) : (
                    <>Everything this <span className="font-semibold">{deleteTarget.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</span>{' '}
                    made, uploaded or edited — tasks, categories, announcements — is KEPT.</>
                  )}
              </p>
              <p>• Organization tasks, categories and announcements are never destroyed; the author name simply becomes “—”.</p>
              {deleteTarget.role === 'STANDARD' && deleteImpact && (
                <p className="text-red-600 font-medium">
                  Will be removed with this login: {deleteImpact.personalTasks} personal task(s)
                  · {deleteImpact.personalCategories} personal category(ies)
                  · {deleteImpact.bookmarks} bookmark(s).
                </p>
              )}
              {deleteTarget.role === 'STANDARD' && !deleteImpact && (
                <p className="text-gray-400 italic">Counting their personal items…</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 size={15} className="animate-spin" />}
                Delete Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
