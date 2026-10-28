import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Save, Settings2, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';
import { fetchSiteSettings, useSiteBranding, type SiteSettings } from '../lib/siteSettings';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * Website Settings — SUPER ADMIN only.
 * Change the website Name, Description and Logo (URL). Saving updates the
 * sidebar/header branding everywhere instantly and the browser tab title.
 */
export default function SiteSettingsPage() {
  const ctx = useOutletContext<Ctx>();
  const { isSuperAdmin: hookSuper } = useAuth();
  const isSuperAdmin = hookSuper || ctx.profile?.role === 'SUPER_ADMIN';
  const { refresh } = useSiteBranding();

  const [form, setForm] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchSiteSettings().then(setForm);
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg('');
    setErr('');
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: 1, ...form, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) setErr(error.message);
    else {
      await refresh();
      setMsg('Website settings saved. Branding updated across the app.');
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <Settings2 size={28} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-700">Super Admin access required</p>
        <p className="text-sm text-gray-500 mt-1">
          Only the Super Admin can change the website name, description and logo.
        </p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="py-20 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Settings2 size={22} className="text-blue-600" />
          Website Settings
        </h1>
        <p className="text-sm text-gray-500">
          Customize how the system appears to all users of the DILG Siquijor Provincial Office.
        </p>
      </div>

      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
          {msg}
        </div>
      )}
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website Name</label>
          <input
            value={form.site_name ?? ''}
            onChange={(e) => setForm({ ...form, site_name: e.target.value })}
            placeholder="D.E.N.N.I.S"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            rows={3}
            value={form.site_description ?? ''}
            onChange={(e) => setForm({ ...form, site_description: e.target.value })}
            placeholder="DILG Employee Navigation & Notices Information System"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Logo URL{' '}
            <span className="text-xs text-gray-400">
              — paste a public image URL (e.g. uploaded to your Supabase Storage bucket)
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              value={form.logo_url ?? ''}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://…/dilg-logo.png"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo preview" className="w-10 h-10 object-contain" />
              ) : (
                <ImageIcon size={18} className="text-gray-300" />
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
          <input
            value={form.footer_text ?? ''}
            onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
            placeholder="DILG Region VII • Siquijor Provincial Office"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Settings
        </button>
      </div>
    </div>
  );
}
