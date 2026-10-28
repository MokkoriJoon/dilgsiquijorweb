import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useSiteSettings, SiteLogo } from '../lib/useSiteSettings';
import { ROLE_LABELS } from '../lib/types';
import {
  LayoutDashboard,
  ClipboardList,
  FolderTree,
  Tags,
  Link2,
  Users,
  LogOut,
  Menu,
  X,
  Settings,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: any;
  showFor?: ('STANDARD' | 'ADMIN' | 'SUPER_ADMIN')[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
  { label: 'My Tasks', path: '/app/tasks', icon: ClipboardList },
  { label: 'Task Management', path: '/app/manage', icon: FolderTree },
  { label: 'Task Categories', path: '/app/categories', icon: Tags },
  { label: 'Resource Links', path: '/app/resources', icon: Link2 },
  { label: 'User Management', path: '/app/users', icon: Users, showFor: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Website Settings', path: '/app/settings', icon: Settings, showFor: ['SUPER_ADMIN'] },
];

export default function AppLayout() {
  const { profile, loading, signOut, isAdminOrAbove } = useAuth();
  const { settings } = useSiteSettings();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // "General: Public Dashboard" is no longer offered to logged-in users —
  // only the Login page and the direct public URL remain.

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.showFor || item.showFor.includes(profile.role),
  );

  const isActive = (path: string) =>
    path === '/app' ? location.pathname === '/app' : location.pathname.startsWith(path);

  const sidebarContent = (
    <aside className="flex flex-col h-full bg-blue-950 text-white w-64">
      {/* Logo / site identity */}
      <div className="p-5 border-b border-blue-900/50">
        <div className="flex items-center gap-3">
          <SiteLogo size={44} />
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{settings.site_name}</h1>
            <p className="text-[10px] text-blue-300 leading-tight mt-0.5 line-clamp-2">
              {settings.site_description}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.path)
                ? 'bg-blue-800 text-white'
                : 'text-blue-200 hover:bg-blue-900 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </a>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-blue-900/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {(profile.full_name ?? 'U')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{profile.full_name}</p>
            <p className="text-xs text-blue-300 truncate">
              {ROLE_LABELS[profile.role]}
              {profile.position ? ` · ${profile.position}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/40 hover:text-red-200 transition-colors"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64">{sidebarContent}</div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-blue-950 text-white flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <SiteLogo size={30} />
          <span className="font-bold text-sm truncate">{settings.site_name}</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1">
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebarContent}</div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet context={{ isAdminOrAbove }} />
        </div>
      </main>
    </div>
  );
}

