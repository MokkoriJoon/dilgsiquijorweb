import { useEffect } from 'react';
import { X, User, Mail, Briefcase, ShieldCheck, CalendarDays, Hash } from 'lucide-react';
import type { Profile } from '../lib/types';
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '../lib/types';

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
 * Read-only profile details popup.
 * Opened by clicking the user card in the sidebar / header of the logged-in app.
 * Shows Name, Position, Email, Role and Date Created.
 */
export default function ProfileModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const initials = (profile.full_name ?? 'S')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-700 text-white flex items-center justify-center font-semibold">
              {initials}
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
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

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

        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
