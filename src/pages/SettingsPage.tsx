import { useRef, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useSiteSettings, StaticSiteLogo } from '../lib/useSiteSettings';
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  type SiteSettings,
} from '../lib/types';
import {
  Save,
  Image as ImageIcon,
  RotateCcw,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  Link2,
} from 'lucide-react';

/**
 * Website Settings — Super Admin only.
 * Change the public website name, description and logo (shown on the
 * public dashboard, login/register pages and the workspace sidebar).
 */
export default function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  const { settings, saveSettings } = useSiteSettings();

  const [form, setForm] = useState({
    site_name: settings.site_name,
    site_description: settings.site_description,
    logo_url: settings.logo_url ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 flex flex-col items-center text-center">
        <ShieldAlert size={40} className="text-red-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-800">Restricted area</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Only the Super Admin can change the website name, description and logo.
        </p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const err = await saveSettings({
      site_name: form.site_name.trim() || DEFAULT_SITE_NAME,
      site_description: form.site_description.trim() || DEFAULT_SITE_DESCRIPTION,
      logo_url: form.logo_url.trim() || null,
    });
    setSaving(false);
    if (err) setMessage({ kind: 'err', text: `Could not save: ${err}` });
    else setMessage({ kind: 'ok', text: 'Website settings saved. Changes apply everywhere.' });
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 300_000) {
      setMessage({
        kind: 'err',
        text: 'Logo too large (max ~300 KB for embedded data). Use a smaller image or paste an image URL.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, logo_url: String(reader.result ?? '') }));
      setMessage({ kind: 'ok', text: 'Logo loaded — press Save to apply.' });
    };
    reader.readAsDataURL(file);
  }

  const preview: SiteSettings = {
    id: 1,
    site_name: form.site_name || DEFAULT_SITE_NAME,
    site_description: form.site_description || DEFAULT_SITE_DESCRIPTION,
    logo_url: form.logo_url.trim() || null,
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Website Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Identity shown on the Public Dashboard, Login pages and the staff workspace.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-3 mb-5 flex items-center gap-2 text-sm ${
            message.kind === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {message.kind === 'ok' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          {message.text}
        </div>
      )}

      {/* Live preview */}
      <div className="bg-blue-900 rounded-xl p-5 mb-6 flex items-center gap-4 shadow">
        <StaticSiteLogo settings={preview} size={56} />
        <div className="min-w-0">
          <p className="text-white font-bold text-lg leading-tight truncate">
            {preview.site_name}
          </p>
          <p className="text-blue-200 text-xs leading-tight mt-0.5 line-clamp-2">
            {preview.site_description}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website Name</label>
          <input
            value={form.site_name}
            onChange={(e) => setForm({ ...form, site_name: e.target.value })}
            placeholder={DEFAULT_SITE_NAME}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.site_description}
            onChange={(e) => setForm({ ...form, site_description: e.target.value })}
            rows={3}
            placeholder={DEFAULT_SITE_DESCRIPTION}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">
              <ImageIcon size={14} /> Logo
            </span>
          </label>
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-gray-400" />
            <input
              value={form.logo_url.startsWith('data:') ? '(uploaded image embedded)' : form.logo_url}
              onChange={(e) =>
                setForm({
                  ...form,
                  logo_url: e.target.value,
                })
              }
              disabled={form.logo_url.startsWith('data:')}
              placeholder="Paste a logo image URL (https://…)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ImageIcon size={14} /> Upload image…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoFile(e.target.files?.[0])}
            />
            {form.logo_url && (
              <button
                type="button"
                onClick={() => setForm({ ...form, logo_url: '' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <RotateCcw size={14} /> Remove logo (use default DILG badge)
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Tip: upload stores the image locally in this browser; for a permanent logo visible to
            everyone, paste a hosted image URL (e.g. your office website or Supabase Storage link).
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Website Settings
          </button>
        </div>
      </div>
    </div>
  );
}
