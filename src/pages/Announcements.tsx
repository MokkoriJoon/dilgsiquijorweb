import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Megaphone, Plus, Pencil, Trash2, X, Users, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import {
  useAnnouncements,
  fiveW1H,
  fetchRegisteredUsers,
} from '../lib/useAnnouncements';
import type {
  Announcement,
  AnnouncementDetails,
  RegisteredUserOption,
} from '../lib/useAnnouncements';
import { isAdminOrAbove } from '../lib/types';

interface Ctx {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isAdminOrAbove: boolean;
}

/**
 * WHO ↔ `whois` helpers.
 * The stored value is a plain comma-separated list of names, e.g.
 *   "Juan Dela Cruz, Maria Santos, Office of the Governor"
 * Names that match a registered user (case-insensitive) are rendered as
 * checkboxes; anything else goes through the "Others" free-text field.
 */
function splitWho(v: string): string[] {
  return Array.from(
    new Set(
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function joinWho(names: string[]): string {
  return Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).join(', ');
}

/**
 * Announcements — available to ALL user roles.
 *  • STANDARD users can READ announcements only.
 *  • ADMIN / SUPER_ADMIN can Make Announcements (create / edit / delete).
 *
 * Announcements are NOT tasks: they have NO completion status and are NEVER
 * counted in task totals or statistics system-wide (separate table + RLS).
 */
export default function Announcements() {
  const { profile } = useOutletContext<Ctx>();
  const a = useAnnouncements();
  const canManage = isAdminOrAbove(profile?.role);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this announcement?')) return;
    await a.remove(id);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Megaphone size={22} className="text-blue-600" />
            Announcements
          </h1>
          <p className="text-sm text-gray-500">
            Office notices shown on the public dashboard ticker.{' '}
            <span className="font-medium text-gray-600">
              Not tasks — no completion status, never counted in task totals.
            </span>
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-bold shadow-sm"
          >
            <Plus size={15} /> Make Announcement
          </button>
        )}
      </div>

      {a.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          Could not load announcements ({a.error}). Re-run supabase/schema.sql to create the
          announcements table.
        </div>
      )}

      {formOpen && canManage && (
        <AnnouncementFormModal
          editing={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={async (title, body, details, visible) => {
            const res = editing
              ? await a.update(editing.id, { title, body, is_visible: visible, ...details })
              : await a.create({ title, body, authorId: profile?.id ?? null, is_visible: visible, ...details });
            if (!res.error) {
              setFormOpen(false);
              setEditing(null);
            }
            return res;
          }}
        />
      )}

      {a.loading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
        </div>
      ) : a.announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
          <p className="text-gray-500 font-medium">No announcements yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            {canManage
              ? 'Click “Make Announcement” to post the first notice.' : 'Check back later for office notices.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {a.announcements.map((an) => (
            <li key={an.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* Visibility badge — hidden notices stay on this page but
                      are removed from the public dashboard ticker/News. */}
                  {an.is_visible === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-[10px] font-bold mb-1">
                      <EyeOff size={11} /> Hidden — not shown publicly
                    </span>
                  )}
                  {/* WHAT (headline) — required */}
                  <h2 className="font-semibold text-gray-800 leading-snug break-words">{an.title}</h2>
                  {/* WHAT (details) — optional */}
                  {an.body?.trim() && (
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{an.body}</p>
                  )}
                  {/* 5W1H extras — shown only when filled in */}
                  {(() => {
                    const d = fiveW1H(an);
                    const rows = [
                      ['Who', d.whois],
                      ['When', d.when],
                      ['Where', d.whereis],
                      ['Why', d.why],
                      ['How', d.how],
                    ] as Array<[string, string]>;
                    return rows
                      .filter(([, v]) => v.trim())
                      .map(([label, v]) => (
                        <p key={label} className="text-xs text-gray-600 mt-1 leading-snug break-words">
                          <span className="font-bold text-gray-700">{label}: </span>
                          <span className="whitespace-pre-wrap">{v}</span>
                        </p>
                      ));
                  })()}
                  <p className="text-[11px] text-gray-400 mt-2">
                    {an.author_name ?? 'Staff'} ·{' '}
                    {an.created_at ? new Date(an.created_at).toLocaleString() : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex-shrink-0 flex gap-1">
                    <button
                      onClick={() => a.setVisible(an.id, an.is_visible === false)}
                      title={
                        an.is_visible === false
                          ? 'Make this announcement visible on the public dashboard'
                          : 'Hide this announcement (keeps it here — not deleted)'
                      }
                      className={`rounded-lg border p-2 ${
                        an.is_visible === false
                          ? 'border-green-200 text-green-600 hover:bg-green-50'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {an.is_visible === false ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(an);
                        setFormOpen(true);
                      }}
                      title="Edit announcement"
                      className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(an.id)}
                      title="Delete announcement"
                      className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Optional 5W1H field definitions (WHAT = title/message is handled above).
 *  WHO and WHEN have dedicated custom controls in the form, so they are not
 *  part of this generic text list. */
const OPTIONAL_5W1H: Array<{
  key: keyof AnnouncementDetails;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  { key: 'whereis', label: 'Where', hint: 'WHERE does it happen?', placeholder: 'e.g. Provincial Capitol LRT Lobby' },
  { key: 'why', label: 'Why', hint: 'WHY is this being announced?', placeholder: 'e.g. Scheduled power maintenance' },
  { key: 'how', label: 'How', hint: 'HOW will it proceed / what should staff do?', placeholder: 'e.g. Bring printed back-up files' },
];

/** "2026-10-29" (input[type=date] value) → "Thursday, October 29, 2026". */
function formatCalendarDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** "08:00" (input[type=time] value) → "8:00 AM". */
function formatClockTime(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Extract a yyyy-mm-dd date from a stored WHEN string (if it has one). */
function extractDate(str: string): string {
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

/** Extract an HH:mm time from a stored WHEN string (if it has one). */
function extractTime(str: string): string {
  const m = str.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return '';
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function AnnouncementFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Announcement | null;
  onClose: () => void;
  onSave: (
    title: string,
    body: string,
    details: AnnouncementDetails,
    visible: boolean,
  ) => Promise<{ error?: string }>;
}) {
  const d = editing ? fiveW1H(editing) : { whois: '', when: '', whereis: '', why: '', how: '' };
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [details, setDetails] = useState<AnnouncementDetails>(d);
  /** Visible / Hidden toggle — hide a finished notice without deleting it. */
  const [visible, setVisible] = useState(editing ? editing.is_visible !== false : true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ── WHO — registered-user picker + free-text "Others" ─────────────── */
  const [users, setUsers] = useState<RegisteredUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  /** Full names ticked from the Registered Users list (pre-ticked on edit
   *  once the user list has loaded — see effect below). */
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  /** Names typed into the "Others" field (comma-separated, not registered). */
  const [othersText, setOthersText] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Load the registered users once when the form opens.
  useEffect(() => {
    let alive = true;
    setUsersLoading(true);
    fetchRegisteredUsers().then((list) => {
      if (!alive) return;
      setUsers(list);
      setUsersLoading(false);
      // Pre-tick WHO names that match registered users; the rest go to "Others".
      const names = splitWho(d.whois);
      const lowerMap = new Map(list.map((u) => [(u.full_name ?? '').trim().toLowerCase(), u.full_name ?? '']));
      const matched: string[] = [];
      const others: string[] = [];
      names.forEach((n) => {
        const hit = lowerMap.get(n.toLowerCase());
        if (hit) matched.push(hit);
        else others.push(n);
      });
      setSelectedNames(matched);
      setOthersText(others.join(', '));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Keep the stored `whois` value in sync: selected users + others text. */
  useEffect(() => {
    const others = splitWho(othersText);
    setDetails((prev) => ({ ...prev, whois: joinWho([...selectedNames, ...others]) }));
  }, [selectedNames, othersText]);

  function toggleWhoName(name: string) {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const filteredUsers = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        (u.full_name ?? '').toLowerCase().includes(needle) ||
        (u.position ?? '').toLowerCase().includes(needle),
    );
  }, [users, userSearch]);

  /** Names currently visible in the (search-filtered) registered-users list. */
  const visibleNames = useMemo(
    () => filteredUsers.map((u) => u.full_name ?? u.id),
    [filteredUsers],
  );

  /** Are ALL currently-visible users already selected? */
  const allVisibleSelected =
    visibleNames.length > 0 && visibleNames.every((n) => selectedNames.includes(n));

  /** Select All / Deselect All — respects the active search filter. */
  function toggleSelectAll() {
    setSelectedNames((prev) => {
      if (allVisibleSelected) {
        // Remove only the visible ones; keep any selections hidden by search.
        const visibleSet = new Set(visibleNames);
        return prev.filter((n) => !visibleSet.has(n));
      }
      return Array.from(new Set([...prev, ...visibleNames]));
    });
  }

  /* ── WHEN — calendar-style date + time pickers ──────────────────────── */
  const [whenDate, setWhenDate] = useState(() => extractDate(d.when));
  const [whenTime, setWhenTime] = useState(() => extractTime(d.when));
  /** Extra note kept alongside the picked date/time (e.g. "Assembly grounds"). */
  const [whenNote, setWhenNote] = useState(() => {
    let rest = d.when;
    rest = rest.replace(/\d{4}-\d{2}-\d{2}/g, '');
    rest = rest.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*([APap]\.?[Mm]\.?)?\b/g, '');
    return rest.replace(/[·|,-]\s*$/, '').replace(/^\s*[·|,-]/, '').trim();
  });

  // Rebuild the stored WHEN string whenever a calendar part changes.
  useEffect(() => {
    const parts: string[] = [];
    if (whenDate) parts.push(formatCalendarDate(whenDate));
    if (whenTime) parts.push(formatClockTime(whenTime));
    if (whenNote.trim()) parts.push(whenNote.trim());
    setDetails((prev) => ({ ...prev, when: parts.join(' · ') }));
  }, [whenDate, whenTime, whenNote]);

  async function submit() {
    // ONLY WHAT (the headline) is required to save/publish an announcement.
    if (!title.trim()) {
      setErr('The WHAT (headline) is required — add at least a short title before publishing.');
      return;
    }
    setSaving(true);
    const res = await onSave(title, body, details, visible);
    setSaving(false);
    if (res.error) setErr(res.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 min-w-0">
            <Megaphone size={18} className="text-blue-600 flex-shrink-0" />
            <span className="truncate">{editing ? 'Edit Announcement' : 'Make Announcement'}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── WHAT — the only REQUIRED part of an announcement ── */}
        <fieldset className="border border-blue-200 rounded-lg p-3 mb-3">
          <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-blue-700">
            What <span className="text-red-600">*</span> — Required
          </legend>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Headline <span className="text-red-500">(required)</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="WHAT is being announced? e.g. Water interruption tomorrow"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-2"
          />
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Message <span className="font-normal text-gray-400">(optional details)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add any extra details about the WHAT…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
          />
        </fieldset>

        {/* ── 5W1H extras — all optional ── */}
        <p className="text-[11px] text-gray-500 mb-2">
          The rest of the{' '}
          <span className="font-bold">5W1H (Who · When · Where · Why · How)</span> is optional —
          fill in only what applies. You can publish with just the WHAT above.
        </p>
        <div className="space-y-2.5">
          {/* ── WHO — pick Registered Users + add Others (not registered) ── */}
          <fieldset className="border border-gray-200 rounded-lg p-3">
            <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              Who <span className="font-normal normal-case text-gray-400">— who is affected or involved?</span>
            </legend>

            <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1.5">
              <Users size={12} className="text-blue-600" /> Registered Users
              {selectedNames.length > 0 && (
                <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold">
                  {selectedNames.length} selected
                </span>
              )}
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={usersLoading || visibleNames.length === 0}
                className="ml-auto rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  allVisibleSelected
                    ? 'Unselect all users shown in the list'
                    : 'Select every user shown in the list'
                }
              >
                {allVisibleSelected ? 'Deselect All' : 'Select All'}
              </button>
            </label>
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search names or positions…"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none mb-1.5"
            />
            <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-gray-50/50">
              {usersLoading ? (
                <p className="px-3 py-3 text-xs text-gray-400">Loading registered users…</p>
              ) : filteredUsers.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">
                  {users.length === 0
                    ? 'No registered users found.'
                    : 'No user matches your search — add them under “Others” below.'}
                </p>
              ) : (
                filteredUsers.map((u) => {
                  const name = u.full_name ?? u.id;
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedNames.includes(name)}
                        onChange={() => toggleWhoName(name)}
                      />
                      <span className="font-medium text-gray-700 min-w-0 break-words">{name}</span>
                      {u.position && <span className="text-[10px] text-gray-400 truncate">{u.position}</span>}
                    </label>
                  );
                })
              )}
            </div>

            {/* Others — free-text names NOT registered in the system */}
            <label className="block text-xs font-semibold text-gray-500 mt-2.5 mb-1">
              Others{' '}
              <span className="font-normal text-gray-400">
                — name(s) involved but not registered (separate with commas)
              </span>
            </label>
            <input
              value={othersText}
              onChange={(e) => setOthersText(e.target.value)}
              placeholder="e.g. Office of the Governor, Barangay Captains"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />

            {(details.whois ?? '').trim() && (
              <p className="text-[11px] text-gray-500 mt-2 break-words">
                <span className="font-bold text-gray-600">WHO preview: </span>
                {details.whois}
              </p>
            )}
          </fieldset>

          {/* ── WHEN — calendar-style date & time pickers ── */}
          <fieldset className="border border-gray-200 rounded-lg p-3">
            <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              When <span className="font-normal normal-case text-gray-400">— when does it happen?</span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">📅 Date</label>
                <input
                  type="date"
                  value={whenDate}
                  onChange={(e) => setWhenDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">🕐 Time</label>
                <input
                  type="time"
                  value={whenTime}
                  onChange={(e) => setWhenTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
            </div>
            <label className="block text-xs font-semibold text-gray-500 mt-2 mb-1">
              Note <span className="font-normal text-gray-400">(optional extra, e.g. “Registration starts 7 AM”)</span>
            </label>
            <input
              value={whenNote}
              onChange={(e) => setWhenNote(e.target.value)}
              placeholder="Any additional detail about the WHEN…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {(details.when ?? '').trim() && (
              <p className="text-[11px] text-gray-500 mt-2 break-words">
                <span className="font-bold text-gray-600">WHEN preview: </span>
                {details.when}
              </p>
            )}
          </fieldset>

          {OPTIONAL_5W1H.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {f.label}{' '}
                <span className="font-normal text-gray-400">— {f.hint}</span>
              </label>
              <input
                value={details[f.key] ?? ''}
                onChange={(e) => setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

        {/* ── Visible / Hidden toggle — hide a finished notice without deleting it ── */}
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              {visible ? <Eye size={14} className="text-green-600" /> : <EyeOff size={14} className="text-gray-500" />}
              {visible ? 'Visible on the Public Dashboard' : 'Hidden from the Public Dashboard'}
            </p>
            <p className="text-[10px] text-gray-500">
              {visible
                ? 'Everyone can see this announcement on the public board ticker & News.'
                : 'This notice is kept (not deleted) but no longer shown publicly.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            onClick={() => setVisible((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              visible ? 'bg-green-600' : 'bg-gray-300'
            }`}
            title={visible ? 'Click to hide' : 'Click to make visible'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                visible ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-bold"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Publish'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Announcements appear on the public dashboard preview carousel immediately. They are not
          tasks and are not counted anywhere in task statistics.
        </p>
      </div>
    </div>
  );
}
