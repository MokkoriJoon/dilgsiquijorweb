import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadAvatar, deleteAvatars } from '../lib/avatar';
import Avatar from './Avatar';
import type { Profile } from '../lib/types';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';
import { X, User, Mail, Briefcase, ShieldCheck, CalendarDays, Hash, Camera, Loader2, Trash2 } from 'lucide-react';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Profile details popup — viewable by everyone, EDITABLE by the owner.
 * Name, Position / Designation and the profile picture (auto-compressed
 * upload to the Supabase "avatars" Storage bucket) can be changed here;
 * email, role and dates stay read-only.
 */
export default function ProfileModal({
  profile,
  onClose,
  onUpdated,
}: {
  profile: Profile;
  onClose: () => void;
  /** Called with the new values so the app can refresh its cached profile. */
  onUpdated?: (patch: Partial<Profile>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [position, setPosition] = useState(profile.position ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Release object URLs when the pending pick changes / modal unmounts.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const displaySrc = editing && removeAvatar ? null : previewUrl ?? avatarUrl;

  const pickFile = (file: File | null) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP…).');
      return;
    }
    setRemoveAvatar(false);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setError('');
    if (!fullName.trim()) {
      setError('Full name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      let nextAvatar = removeAvatar ? null : avatarUrl;

      // Upload the newly chosen picture (auto-compressed before upload).
      if (pendingFile) {
        const res = await uploadAvatar(profile.id, pendingFile);
        nextAvatar = res.url;
      } else if (removeAvatar) {
        await deleteAvatars(profile.id).catch(() => undefined);
      }

      const patch = {
        full_name: fullName.trim(),
        position: position.trim() || null,
        avatar_url: nextAvatar,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes('avatar_url')
            ? 'The database is missing the avatar_url column. Run supabase/schema.sql once in the Supabase SQL editor.'
            : `Could not save your profile: ${updateError.message}`,
        );
        return;
      }

      // Keep auth metadata roughly in sync (used as fallback for provisional profiles).
      supabase.auth
        .updateUser({ data: { full_name: patch.full_name, position: patch.position } })
        .catch(() => undefined);

      onUpdated?.(patch);
      setAvatarUrl(nextAvatar);
      setPendingFile(null);
      setRemoveAvatar(false);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { icon: User, label: 'Full Name', value: profile.full_name ?? '—' },
    { icon: Briefcase, label: 'Position / Designation', value: profile.position ?? '—' },
    { icon: Mail, label: 'Email', value: profile.email ?? '—' },
    { icon: CalendarDays, label: 'Date Created', value: formatDateTime(profile.created_at) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="My profile"
    >
      <div className="absolute inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar name={profile.full_name} src={displaySrc} size={48} />
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change profile picture"
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700"
                  >
                    <Camera size={12} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800 truncate">{profile.full_name ?? 'Staff Member'}</h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-0.5 ${ROLE_BADGE_CLASSES[profile.role]}`}
              >
                <ShieldCheck size={10} />
                {ROLE_LABELS[profile.role]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {editing ? (
          <div className="px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Profile picture */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                Profile Picture
              </label>
              <p className="text-xs text-gray-500">
                JPG / PNG / WebP — automatically compressed (resized ≤512px, JPEG) before upload.
              </p>
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Camera size={13} />
                  {displaySrc ? 'Change photo' : 'Upload photo'}
                </button>
                {displaySrc && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      setRemoveAvatar(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Full name */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                Full Name *
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>

            {/* Position / Designation */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                Position / Designation
              </label>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g., Administrative Officer"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>

            {/* Read-only email */}
            <p className="text-sm text-gray-500">
              <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold block">
                Email
              </span>
              {profile.email ?? '—'}
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setEditing(false);
                  setFullName(profile.full_name ?? '');
                  setPosition(profile.position ?? '');
                  setAvatarUrl(profile.avatar_url ?? null);
                  setPendingFile(null);
                  setRemoveAvatar(false);
                  setError('');
                }}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="px-5 py-4 space-y-3">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3">
                  <r.icon size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                      {r.label}
                    </dt>
                    <dd className="text-sm text-gray-800 break-words">{r.value}</dd>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <Hash size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                    User ID
                  </dt>
                  <dd className="text-xs text-gray-500 font-mono break-all">{profile.id}</dd>
                </div>
              </div>
            </dl>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
              >
                Edit Profile
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
