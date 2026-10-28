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
} from 'lucide-react';

interface UserFormState {
  id?: string;
  full_name: string;
  email: string;
  office: string;
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
          (u.office ?? '').toLowerCase().includes(query.toLowerCase()),
      ),
    [users, query],
  );

  function openCreate() {
    setFormError('');
    setForm({
      full_name: '',
      email: '',
      office: '',
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
      office: user.office ?? '',
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
          office: form.office.trim() || null,
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
        p_office: form.office.trim() || null,
        p_role: form.role,
      });
      err = rpcErr?.message ?? null;
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
    // Deleting the profile row cascades to tasks (ON DELETE CASCADE).
    // The linked auth account should also be removed via Supabase Dashboard
    // (Authentication → Users) or a service-role edge function.
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setPageError(error.message);
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
          placeholder="Search name, email, or office…"
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
                  <th className="px-5 py-3 font-semibold">Office</th>
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
                    <td className="px-5 py-4 text-gray-600">{user.office ?? '—'}</td>
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
                          onClick={() => openEdit(user)}
                          title="Edit user"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
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
        Note: removing a user here deletes their profile &amp; tasks. To fully delete
        their login account, remove them in Supabase → Authentication → Users.
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
                  Office / Department
                </label>
                <input
                  value={form.office}
                  onChange={(e) => setForm({ ...form, office: e.target.value })}
                  placeholder="e.g., Planning Division"
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
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
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

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800">Delete user?</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium">{deleteTarget.full_name}</span> and all of
              their task assignments will be removed. This cannot be undone.
            </p>
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
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
