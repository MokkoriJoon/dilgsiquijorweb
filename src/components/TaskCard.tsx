import { useState } from 'react';
import { Link2, CheckCircle2, RotateCcw, Pencil, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Task } from '../lib/types';
import { StatusBadge, CategoryBadge, RecurrenceBadge, DueBadge, AssigneeList, NextRunHint } from './TaskBadges';
import { formatDueDate } from '../lib/useTasks';

/**
 * One row/card in any task list.
 *  • The "Complete Task" button appears ONLY for users actually assigned to
 *    the task (or a SUPER_ADMIN, who may complete ANY task even when not
 *    assigned). Unassigned users never see a Complete button.
 *  • Completing flips the task out of Pending into COMPLETE immediately; on
 *    multi-assignee tasks each user certifies their own slice and the whole
 *    task completes once every assignee has certified.
 *  • Admins/Super Admins get global edit/delete; STANDARD users can NEVER
 *    edit or delete tasks merely assigned to them (only their own Personal
 *    Tasks stay fully editable — enforced via the `canManage` prop).
 */
export default function TaskCard({
  task,
  status,
  canManage,
  canComplete = true,
  myDone = false,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
}: {
  task: Task;
  status: 'completed' | 'pending' | 'overdue';
  /** Admin or above → edit/delete/reopen allowed. */
  canManage: boolean;
  /** Current user is an assignee OR a Super Admin → may certify completion. */
  canComplete?: boolean;
  /** The current user already certified THEIR OWN assignment (multi-assignee). */
  myDone?: boolean;
  onComplete: (id: string, note: string) => Promise<{ error?: string }>;
  onReopen?: (id: string) => Promise<{ error?: string }> | void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function confirmComplete() {
    if (!ack) {
      setErr('Please tick the acknowledgement checkbox first.');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await onComplete(task.id, note);
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      setConfirming(false);
      setAck(false);
      setNote('');
    }
  }

  return (
    <div
      className={`bg-white rounded-xl border p-4 sm:p-5 shadow-sm transition-colors ${
        status === 'overdue' ? 'border-red-200' : 'border-gray-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={status} />
            <CategoryBadge task={task} />
            <RecurrenceBadge task={task} />
          </div>
          <h3
            className={`font-semibold text-gray-800 leading-snug ${
              status === 'completed' ? 'line-through text-gray-400' : ''
            }`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
            <DueBadge task={task} status={status} />
            <NextRunHint task={task} />
            <span className="text-gray-400">
              Assigned: <AssigneeList task={task} />
            </span>
          </div>

          {/* Clickable resource links for assigned users */}
          {(task.links?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {task.links!.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Link2 size={12} />
                  {l.label}
                </a>
              ))}
            </div>
          )}

          {task.status === 'completed' && (
            <p className="text-[11px] text-green-700 mt-2">
              Completed {formatDueDate(task.completed_at ?? null)}
              {task.completion_note ? ` · Note: ${task.completion_note}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {status !== 'completed' && canComplete && !myDone && (
            <button
              onClick={() => setConfirming((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-sm font-medium"
            >
              <CheckCircle2 size={14} />
              Complete Task
            </button>
          )}
          {status !== 'completed' && myDone && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 text-sm font-medium"
              title="You already certified your part — the task completes when every assignee certifies."
            >
              <CheckCircle2 size={14} />
              You completed your part
            </span>
          )}
          {status === 'completed' && canManage && onReopen && (
            <button
              onClick={() => onReopen(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 text-sm font-medium"
              title="Reopen (admin only)"
            >
              <RotateCcw size={14} />
              Reopen
            </button>
          )}
          {canManage && (
            <div className="flex gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(task)}
                  className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                  title="Edit task (admin)"
                >
                  <Pencil size={15} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(task)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                  title="Delete task (admin)"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Liability acknowledgement before marking complete */}
      {confirming && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <ShieldAlert size={16} />
            Notice of Responsibility &amp; Accountability
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            By marking this task as <strong>Complete</strong>, you certify under the accountability
            rules of the DILG Provincial Office of Siquijor that the work has actually and fully
            been accomplished. You will be <strong>held responsible and liable</strong> if it is
            later determined that the task was not truly completed. False certification may be
            subject to administrative discipline.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional completion note / proof reference…"
            className="w-full mt-3 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
          {err && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={12} /> {err}
            </p>
          )}
          <label className="mt-2 flex items-start gap-2 text-xs font-medium text-amber-900 cursor-pointer">
            <input
              type="checkbox"
              checked={ack}
              className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand and accept that I am held responsible and liable for this certification.
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={confirmComplete}
              disabled={!ack || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white px-3 py-1.5 text-sm font-semibold"
            >
              <CheckCircle2 size={14} />
              {busy ? 'Saving…' : 'I certify — Mark Complete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
