import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Profile, UserRole } from './types';

/**
 * Loads the current logged-in user's profile from the `profiles` table.
 * Falls back to data stored in auth metadata when no profile row exists yet.
 */
export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let mounted = true;

    const loadProfile = async (userId: string) => {
      // NOTE: role assignment happens in the database — the FIRST registered
      // user is automatically made SUPER_ADMIN by the handle_new_user() trigger
      // (see supabase/schema.sql). Nothing to bootstrap here.
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!mounted) return;

      if (data) {
        setProfile(data as Profile);
      } else {
        // Fallback: build a provisional profile from auth metadata
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setProfile({
          id: userId,
          full_name: (user?.user_metadata?.full_name as string) ?? null,
          email: user?.email ?? null,
          position: (user?.user_metadata?.position as string) ?? null,
          role: 'STANDARD',
        });
      }
      setLoading(false);
    };

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadProfile(session.user.id);
      } else if (mounted) {
        setProfile(null);
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdminOrAbove = useMemo(
    () => profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN',
    [profile],
  );
  const isSuperAdmin = useMemo(() => profile?.role === 'SUPER_ADMIN', [profile]);

  /** Merge local changes (e.g. after the profile modal saves) into the cached profile. */
  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return { profile, loading, isAdminOrAbove, isSuperAdmin, updateProfile };
}

/** Manually refresh the profile (e.g. after an admin changes your role elsewhere). */
export async function refreshProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export type { Profile, UserRole };
