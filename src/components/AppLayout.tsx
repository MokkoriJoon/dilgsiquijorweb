import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  Users,
  LogOut,
  Menu,
  X,
  Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';

/**
 * Authenticated area shell: left sidebar menu (Dashboard, My Tasks, …)
 * plus a top bar with the signed-in user's identity.
 */
export default function AppLayout() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-800" />
      </div>
    );
  }

  // Route guard — unauthenticated users go back to the public dashboard
  if (!profile) {
    navigate('/login', { replace: true });
    return null;
  }

  const role = profile.role;

  const menuItems = [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/tasks', label: 'My Tasks', icon: ListChecks },
    ...(role === 'SUPER_ADMIN'
      ? [{ to: '/app/users', label: 'User Management', icon: Users }]
      : []),
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-blue-900 flex items-center justify-center">
            <span className="text-white font-bold text-[9px]">DILG</span>
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="text-white font-bold text-base tracking-wide leading-tight">
            D.E.N.N.I.S
          </h1>
          <p className="text-slate-400 text-[10px] leading-tight mt-0.5">
            Employee Workspace
          </p>
        </div>
      </div>

      {/* User card */}
      <div className="px-4 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {(profile.full_name ?? 'S')
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((n) => n[0])
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {profile.full_name ?? 'Staff Member'}
            </p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-0.5 ${ROLE_BADGE_CLASSES[role]}`}
            >
              {ROLE_LABELS[role]}
            </span>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Menu
        </p>
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}

        <p className="px-3 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          General
        </p>
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
        >
          <Eye size={18} />
          Public Dashboard
        </Link>
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-slate-700/60">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-orange-300 hover:bg-slate-700/60 hover:text-orange-200 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-slate-800 flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-800 flex flex-col shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <div className="hidden lg:block">
              <p className="text-sm text-gray-500">
                Welcome back,{' '}
                <span className="font-semibold text-gray-800">
                  {profile.full_name?.split(' ')[0] ?? 'Staff'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ROLE_BADGE_CLASSES[role]}`}
              >
                {ROLE_LABELS[role]}
              </span>
              <span className="text-sm text-gray-600 hidden sm:block truncate max-w-[220px]">
                {profile.email}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <Outlet context={{ profile }} />
        </main>
      </div>
    </div>
  );
}
