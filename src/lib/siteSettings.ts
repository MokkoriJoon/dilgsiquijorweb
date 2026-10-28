import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface SiteSettings {
  id: number;
  site_name: string | null;
  site_description: string | null;
  logo_url: string | null;
  footer_text: string | null;
  updated_at?: string;
}

/** Branding shown anywhere the app needs it (header, sidebar, public page). */
export interface Branding {
  name: string;
  description: string;
  logoUrl: string | null;
  footerText: string;
}

export const DEFAULT_BRANDING: Branding = {
  name: 'D.E.N.N.I.S',
  description: 'DILG Employee Navigation & Notices Information System — Siquijor Provincial Office',
  logoUrl: null,
  footerText: 'DILG Region VII • Siquijor Provincial Office',
};

let cached: Branding = DEFAULT_BRANDING;
const listeners = new Set<(b: Branding) => void>();

function applyToDocument(b: Branding) {
  if (typeof document === 'undefined') return;
  document.title = b.name ? `${b.name} — ${b.description}` : b.description;
}

async function loadSettings(): Promise<Branding> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return cached;
    const s = data as SiteSettings;
    const next: Branding = {
      name: s.site_name?.trim() || DEFAULT_BRANDING.name,
      description: s.site_description?.trim() || DEFAULT_BRANDING.description,
      logoUrl: s.logo_url?.trim() ? s.logo_url.trim() : null,
      footerText: s.footer_text?.trim() || DEFAULT_BRANDING.footerText,
    };
    cached = next;
    applyToDocument(next);
    listeners.forEach((fn) => fn(next));
    return next;
  } catch {
    return cached;
  }
}

/** Shared branding state — every component using it updates when superadmin saves. */
export function useSiteBranding(): {
  branding: Branding;
  refresh: () => Promise<Branding>;
  save: (patch: Partial<SiteSettings>) => Promise<{ error?: string }>;
} {
  const [branding, setBranding] = useState<Branding>(cached);

  useEffect(() => {
    const fn = (b: Branding) => setBranding(b);
    listeners.add(fn);
    loadSettings();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const refresh = useCallback(() => loadSettings(), []);

  const save = useCallback(
    async (patch: Partial<SiteSettings>) => {
      const payload = {
        id: 1,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('site_settings').upsert(payload);
      if (error) return { error: error.message };
      await loadSettings();
      return {};
    },
    [],
  );

  return { branding, refresh, save };
}

/** Read the raw settings row (superadmin editor). */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle();
  return (
    (data as SiteSettings) ?? {
      id: 1,
      site_name: DEFAULT_BRANDING.name,
      site_description: DEFAULT_BRANDING.description,
      logo_url: null,
      footer_text: DEFAULT_BRANDING.footerText,
    }
  );
}
