import { Link } from 'react-router-dom';
import { Shield, LogOut, LayoutDashboard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';

interface HeaderProps {
  isAuthenticated: boolean;
  profile?: Profile | null;
}

export default function Header({ isAuthenticated, profile }: HeaderProps) {
  const role = profile?.role ?? 'STANDARD';
  return (
    <header className="bg-blue-900 shadow-lg" style={{ minHeight: '80px' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        {/* Left side - Logo and Title */}
        <div className="flex items-center gap-4">
          {/* DILG Logo */}
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-md flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-blue-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs">DILG</span>
            </div>
          </div>
          
          {/* Title */}
          <div className="hidden sm:block">
            <h1 className="text-white font-bold text-xl tracking-wide">D.E.N.N.I.S</h1>
            <p className="text-blue-200 text-xs leading-tight">
              DILG Employee Navigation & Notices Information System
            </p>
          </div>
        </div>

        {/* Right side - User chip / Login Button */}
        <div>
          {isAuthenticated && profile ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-white text-sm font-medium leading-tight">
                  {profile.full_name ?? 'Staff Member'}
                </span>
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE_CLASSES[role]}`}
                >
                  {ROLE_LABELS[role]}
                </span>
              </div>
              <Link
                to="/app/dashboard"
                className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                <LayoutDashboard size={16} />
                <span className="hidden md:inline">My Dashboard</span>
              </Link>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
            >
              <Shield size={16} />
              Staff Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
