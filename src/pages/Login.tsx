import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Shield, Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import { useSiteBranding } from '../lib/siteSettings';
import PasswordInput from '../components/PasswordInput';

/** Renders the site logo: the uploaded image when configured, DILG badge otherwise. */
export function BrandLogo({ size = 56 }: { size?: number }) {
  const { branding } = useSiteBranding();
  return (
    <div
      className="rounded-full bg-white flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt="Logo"
          className="w-full h-full object-contain"
          onError={(e) => {
            // Broken logo URL → fall back to the DILG badge instead of an empty circle.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="rounded-full bg-blue-900 flex items-center justify-center" style={{ width: size - 8, height: size - 8 }}>
          <span className="text-white font-bold text-[10px]">DILG</span>
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { branding } = useSiteBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        navigate('/app/dashboard');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-blue-900 shadow-lg" style={{ minHeight: '80px' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
          <Link to="/" className="flex items-center gap-4">
            <BrandLogo />
            <div className="hidden sm:block">
              <h1 className="text-white font-bold text-xl tracking-wide">{branding.name}</h1>
              <p className="text-blue-200 text-xs leading-tight">{branding.description}</p>
            </div>
          </Link>
        </div>
      </header>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-blue-600" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Staff Login</h2>
              <p className="text-gray-500 text-sm mt-1">
                Sign in to {branding.name} — {branding.description}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="staff@dilg.gov.ph"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-10 pr-11 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Remember me */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">Remember me</span>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
            </form>

            {/* Register Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 hover:text-blue-800 font-medium">
                  Register here
                </Link>
              </p>
            </div>
          </div>

          {/* Back to Dashboard */}
          <div className="text-center mt-4">
            <Link
              to="/"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
