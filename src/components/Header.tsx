import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface HeaderProps {
  isAuthenticated: boolean;
}

export default function Header({ isAuthenticated }: HeaderProps) {
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

        {/* Right side - Login Button */}
        <div>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-blue-100 text-sm hidden sm:block">Staff Member</span>
              <Link
                to="/login"
                onClick={(e) => {
                  e.preventDefault();
                  supabase.auth.signOut();
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                <Shield size={16} />
                Sign Out
              </Link>
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
