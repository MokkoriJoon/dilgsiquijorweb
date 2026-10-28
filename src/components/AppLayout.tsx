import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  Users,
  LogOut,
  Menu,
  X,
  FolderTree,
  Bookmark,
  Settings2,
  Tags,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useTasks } from '../lib/useTasks';
import { useNotifications } from '../lib/notifications';
import NotificationBell from './NotificationBell';
import ProfileModal from './ProfileModal';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';
import { useSiteBranding } from '../lib/siteSettings';

/**
 * Authenticated area shell: left sidebar menu + top bar.
 * NOTE: "General → Public Dashboard" was removed — logged-in users navigate to
 * the public board through their browser if needed, it is no longer a menu item.
 */
export default function AppLayout() {
  const { profile, loading } = useAuth();
  const { branding } = useSiteBranding();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Free notification system: derive alerts from the user's own tasks.
  const t = useTasks(profile ?? null);
  const notif = useNotifications(profile ?? null, t.myTasks);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-800" />
      </div>
    );
  }

  // Route guard — unauthenticated users go back to the login screen
  if (!profile) {
    navigate('/login', { replace: true });
    return null;
  }

  const role = profile.role;
  const isAdminOrAbove = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const menuItems = [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/tasks', label: 'My Tasks', icon: ListChecks },
    { to: '/app/task-management', label: 'Task Management', icon: FolderTree },
    { to: '/app/resources', label: 'Resource Links', icon: Bookmark },
    ...(isAdminOrAbove
      ? [{ to: '/app/categories', label: 'Task Categories', icon: Tags }]
      : []),
    ...(role === 'SUPER_ADMIN'
      ? [
          { to: '/app/users', label: 'User Management', icon: Users },
          { to: '/app/settings', label: 'Website Settings', icon: Settings2 },
        ]
      : []),
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const initials = (profile.full_name ?? 'S')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow flex-shrink-0 overflow-hidden">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-11 h-11 object-contain" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-900 flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">DILG</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-white font-bold text-base tracking-wide leading-tight truncate">
            {branding.name}
          </h1>
          <p className="text-slate-400 text-[10px] leading-tight mt-0.5 line-clamp-2">
            Siquijor Provincial Office
          </p>
        </div>
      </div>

      {/* User card — click to view profile details */}
      <div className="px-4 py-4 border-b border-slate-700/60">
        <button
          type="button"
          onClick={() => {
            setProfileOpen(true);
            setMobileOpen(false);
          }}
          title="View my profile"
          className="w-full flex items-center gap-3 rounded-lg p-1 -m-1 text-left hover:bg-slate-700/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {initials}
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
        </button>
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
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
              <Link to="/" className="flex items-center gap-2 min-w-0">
                {branding.logoUrl && (
                  <img
                    src={branding.logoUrl}
                    alt="Logo"
                    className="w-8 h-8 rounded object-contain bg-white"
                  />
                )}
                <p className="hidden lg:block text-sm text-gray-500 truncate">
                  Welcome back,{' '}
                  <span className="font-semibold text-gray-800">
                    {profile.full_name?.split(' ')[0] ?? 'Staff'}
                  </span>{' '}
                  · <span className="font-medium text-gray-700">{branding.name}</span>
                </p>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell
                notifications={notif.notifications}
                unreadCount={notif.unreadCount}
                markAllRead={notif.markAllRead}
                dismiss={notif.dismiss}
                clearAll={notif.clearAll}
              />
              <span
                className={`hidden sm:inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ROLE_BADGE_CLASSES[role]}`}
              >
                {ROLE_LABELS[role]}
              </span>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="View my profile"
                className="flex items-center gap-2 rounded-full border border-gray-200 pl-1 pr-3 py-1 hover:bg-gray-50 transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {initials}
                </span>
                <span className="text-sm text-gray-600 hidden md:block truncate max-w-[160px]">
                  {profile.full_name?.split(' ')[0] ?? 'Profile'}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <Outlet context={{ profile, isAdminOrAbove }} />
        </main>

        {/* Footer — always stuck at the bottom (mt-auto inside the flex column) */}
        <footer className="mt-auto px-6 py-4 text-center text-xs text-gray-400 border-t border-gray-100 bg-white">
          {branding.footerText}
        </footer>
      </div>

      {profileOpen && <ProfileModal profile={profile} onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
