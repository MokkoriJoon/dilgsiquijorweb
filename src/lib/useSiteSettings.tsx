import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  type SiteSettings,
} from './types';

const SETTINGS_KEY = 'dennis_site_settings';

function readLocal(): SiteSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SiteSettings>;
      return {
        id: 1,
        site_name: parsed.site_name || DEFAULT_SITE_NAME,
        site_description: parsed.site_description || DEFAULT_SITE_DESCRIPTION,
        logo_url: parsed.logo_url ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    id: 1,
    site_name: DEFAULT_SITE_NAME,
    site_description: DEFAULT_SITE_DESCRIPTION,
    logo_url: null,
  };
}

function writeLocal(s: SiteSettings) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        site_name: s.site_name,
        site_description: s.site_description,
        logo_url: s.logo_url,
      }),
    );
  } catch {
    /* ignore */
  }
}

interface SiteContextValue {
  settings: SiteSettings;
  /** Persist new website identity (Super Admin only — enforced by RLS). */
  saveSettings: (patch: Partial<SiteSettings>) => Promise<string | null>;
  refresh: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue>({
  settings: readLocal(),
  saveSettings: async () => null,
  refresh: async () => {},
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(() => readLocal());

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (!error && data) {
        const row = data as SiteSettings;
        const merged: SiteSettings = {
          id: 1,
          site_name: row.site_name || DEFAULT_SITE_NAME,
          site_description:
            row.site_description || DEFAULT_SITE_DESCRIPTION,
          logo_url: row.logo_url ?? null,
        };
        setSettings(merged);
        writeLocal(merged);
      }
    } catch {
      /* offline / table missing — keep local values */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSettings = useCallback(
    async (patch: Partial<SiteSettings>): Promise<string | null> => {
      const next: SiteSettings = { ...settings, ...patch, id: 1 };
      // Optimistic + persisted locally so the public page always reflects it.
      setSettings(next);
      writeLocal(next);
      try {
        const { error } = await supabase
          .from('site_settings')
          .upsert({
            id: 1,
            site_name: next.site_name,
            site_description: next.site_description,
            logo_url: next.logo_url,
            updated_at: new Date().toISOString(),
          });
        if (error) return error.message;
      } catch {
        /* network hiccup — local copy already updated */
      }
      window.dispatchEvent(new Event('storage'));
      return null;
    },
    [settings],
  );

  // Keep other tabs in sync.
  useEffect(() => {
    const onStorage = () => setSettings(readLocal());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <SiteContext.Provider value={{ settings, saveSettings, refresh }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteContext);
}

/** Lightweight standalone hook usable outside the provider (public pages). */
export function usePublicSiteSettings(): SiteSettings {
  const [s, setS] = useState<SiteSettings>(() => readLocal());
  useEffect(() => {
    const sync = () => setS(readLocal());
    window.addEventListener('storage', sync);
    const t = setInterval(sync, 15_000);
    // Also pull from the DB when reachable (anon select is allowed by RLS).
    (async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (!error && data) {
          const merged: SiteSettings = {
            id: 1,
            site_name: data.site_name || DEFAULT_SITE_NAME,
            site_description:
              data.site_description || DEFAULT_SITE_DESCRIPTION,
            logo_url: data.logo_url ?? null,
          };
          writeLocal(merged);
          setS(merged);
        }
      } catch {
        /* keep local */
      }
    })();
    return () => {
      window.removeEventListener('storage', sync);
      clearInterval(t);
    };
  }, []);
  return s;
}

export function SiteLogo({ size = 48, rounded = true }: { size?: number; rounded?: boolean }) {
  const { settings } = useSiteSettings();
  return <StaticSiteLogo settings={settings} size={size} rounded={rounded} />;
}

export function StaticSiteLogo({
  settings,
  size = 48,
  rounded = true,
}: {
  settings: SiteSettings;
  size?: number;
  rounded?: boolean;
}) {
  const shape = rounded ? 'rounded-full' : 'rounded-lg';
  if (settings.logo_url) {
    return (
      <img
        src={settings.logo_url}
        alt={`${settings.site_name} logo`}
        style={{ width: size, height: size }}
        className={`${shape} object-cover bg-white shadow-md flex-shrink-0`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`${shape} bg-blue-900 flex items-center justify-center shadow-md flex-shrink-0`}
    >
      <span className="text-white font-bold" style={{ fontSize: Math.max(8, size * 0.22) }}>
        DILG
      </span>
    </div>
  );
}
