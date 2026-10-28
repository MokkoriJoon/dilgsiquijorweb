import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, Trash2, X, AlertTriangle, Clock, UserPlus } from 'lucide-react';
import type { AppNotification, NotifKind } from '../lib/notifications';
import { useNotifPermission } from '../lib/notifications';

const KIND_STYLE: Record<NotifKind, { icon: typeof Bell; ring: string; bg: string; fg: string }> = {
  overdue: { icon: AlertTriangle, ring: 'ring-red-300', bg: 'bg-red-50', fg: 'text-red-600' },
  'due-soon': { icon: Clock, ring: 'ring-amber-300', bg: 'bg-amber-50', fg: 'text-amber-600' },
  assigned: { icon: UserPlus, ring: 'ring-blue-300', bg: 'bg-blue-50', fg: 'text-blue-600' },
};

/**
 * Free in-app notification centre (bell + dropdown) with optional browser
 * push notifications. No paid service — uses the native Notification API.
 */
export default function NotificationBell({
  notifications,
  unreadCount,
  markAllRead,
  dismiss,
  clearAll,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { supported, permission, request } = useNotifPermission();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasOverdue = notifications.some((n) => n.kind === 'overdue');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        {hasOverdue ? (
          <BellRing size={20} className="text-red-600 animate-pulse" />
        ) : (
          <Bell size={20} />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="font-semibold text-sm text-gray-800">
              Notifications{' '}
              {unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold">
                  {unreadCount} new
                </span>
              )}
            </p>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-200 text-gray-500">
              <X size={14} />
            </button>
          </div>

          {supported && permission !== 'granted' && permission !== 'unsupported' && (
            <button
              onClick={request}
              className="w-full text-left px-4 py-2.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border-b border-blue-100"
            >
              🔔 Click here to also receive <b>browser pop-up alerts</b> for assigned / due-tomorrow /
              overdue tasks (free — no app install needed).
            </button>
          )}

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={22} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 font-medium">You're all caught up!</p>
                <p className="text-xs text-gray-400 mt-1">
                  Alerts appear when a task is assigned, due tomorrow, or overdue.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const s = KIND_STYLE[n.kind];
                const Icon = s.icon;
                return (
                  <div key={n.id} className={`group px-4 py-3 ${s.bg}/40 hover:bg-gray-50`}>
                    <div className="flex gap-3">
                      <div className={`${s.bg} ${s.ring} ring-1 rounded-full p-2 h-fit flex-shrink-0`}>
                        <Icon size={14} className={s.fg} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 leading-snug">{n.title}</p>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</p>
                        <button
                          onClick={() => {
                            setOpen(false);
                            navigate('/app/tasks');
                          }}
                          className="text-[11px] text-blue-600 hover:underline mt-1 font-medium"
                        >
                          View my tasks →
                        </button>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 self-start"
                        title="Dismiss"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-blue-600"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
              <button
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-red-600"
              >
                <Trash2 size={13} /> Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
