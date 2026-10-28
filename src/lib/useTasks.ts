import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from './supabase';
import type { Profile, ResourceLink, Task, TaskFrequency } from './types';
import {
  computeNextDueDate,
  effectiveDeadline,
  effectiveStatus,
  toDateKey,
} from './recurrence';

/** Deadline used for sorting/roll-forward when a task has no explicit dates. */
function baseDeadline(t: Task): string | null {
  return t.next_due_date ?? t.due_date;
}

function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const ea = effectiveStatus(a);
    const eb = effectiveStatus(b);
    // Overdue first, then nearest deadline, then newest created.
    if (ea !== eb) {
      if (ea === 'overdue') return -1;
      if (eb === 'overdue') return 1;
    }
    const da = baseDeadline(a) ?? '9999';
    const db = baseDeadline(b) ?? '9999';
    const cmp = String(da).localeCompare(String(db));
    if (cmp !== 0) return cmp;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
}

export function useTasks(profile: Profile | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  /**
   * Recurrence engine: roll every open recurring task forward so its live
   * deadline is always the next upcoming occurrence. Persisted once per day
   * per task (cheap UPDATEs, guarded by last_occurrence_date).
   */
  const rollForward = useCallback(async (fresh: Task[]) => {
    const now = new Date();
    const updates: { id: string; patch: Partial<Task> }[] = [];
    for (const t of fresh) {
      if (t.status === 'completed' || t.frequency === 'one-time') continue;
      const dl = effectiveDeadline(t);
      if (!dl) continue;
      if (new Date(dl).getTime() >= now.getTime()) continue;
      const next = computeNextDueDate(t, now);
      if (!next) continue;
      updates.push({
        id: t.id,
        patch: {
          next_due_date: next.toISOString(),
          last_occurrence_date: toDateKey(next),
          occurrence_count: (t.occurrence_count ?? 0) + 1,
          updated_at: now.toISOString(),
        },
      });
    }
    if (updates.length === 0) return fresh;
    await Promise.all(
      updates.map((u) => supabase.from('tasks').update(u.patch).eq('id', u.id)),
    );
    return fresh.map((t) => {
      const u = updates.find((x) => x.id === t.id);
      return u ? ({ ...t, ...u.patch } as Task) : t;
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tasksRes, profilesRes] = await Promise.all([
      supabase.from('tasks').select('*'),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    if (tasksRes.error) {
      setError(tasksRes.error.message);
      setTasks([]);
    } else {
      const raw = (tasksRes.data ?? []) as Task[];
      const rolled = await rollForward(raw);
      setTasks(sortTasks(rolled));
    }

    if (!profilesRes.error) {
      setProfiles((profilesRes.data ?? []) as Profile[]);
    }

    setLoading(false);
  }, [rollForward]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const visibleTasks = tasks;

  /** Tasks where the current user is one of the assignees. */
  const myTasks = useMemo(
    () =>
      profile
        ? tasks.filter((t) => (t.assignee_ids ?? []).includes(profile.id))
        : [],
    [tasks, profile],
  );

  const stats = useMemo(() => {
    const count = (list: Task[]) => {
      let pending = 0;
      let completed = 0;
      let overdue = 0;
      list.forEach((t) => {
        const s = effectiveStatus(t);
        if (s === 'completed') completed++;
        else if (s === 'overdue') overdue++;
        else pending++;
      });
      return { total: list.length, pending, completed, overdue };
    };
    return { mine: count(myTasks), all: count(visibleTasks) };
  }, [myTasks, visibleTasks]);

  // ---------- Mutations ----------

  const createTask = async (input: {
    title: string;
    description?: string;
    due_date?: string | null;
    frequency?: TaskFrequency;
    weekdays?: number[] | null;
    assignee_ids: string[];
    category_id?: string | null;
    links?: ResourceLink[];
  }) => {
    const dueIso = input.due_date ? new Date(input.due_date).toISOString() : null;
    const frequency = input.frequency ?? 'one-time';
    const weekdays =
      frequency === 'daily' && input.weekdays && input.weekdays.length > 0
        ? [...input.weekdays].sort((a, b) => a - b)
        : null;
    const row = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: dueIso,
      next_due_date: dueIso,
      last_occurrence_date: dueIso ? toDateKey(new Date(dueIso)) : null,
      frequency,
      weekdays,
      status: 'pending',
      assignee_ids: input.assignee_ids,
      assigned_by: profile?.id ?? null,
      category_id: input.category_id ?? null,
      links: (input.links ?? []).filter((l) => l.url.trim()),
      occurrence_count: 1,
    };
    const { data, error: err } = await supabase
      .from('tasks')
      .insert(row)
      .select()
      .single();
    if (err) return { error: err.message };
    setTasks((prev) => sortTasks([data as Task, ...prev]));
    return { data };
  };

  /** Admin/global edit — repository maintenance. */
  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { data, error: err } = await supabase
      .from('tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (err) return { error: err.message };
    setTasks((prev) => sortTasks(prev.map((t) => (t.id === id ? (data as Task) : t))));
    return { data };
  };

  const deleteTask = async (id: string) => {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err) return { error: err.message };
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return {};
  };

  /**
   * Assigned users complete the CURRENT occurrence. Recurring tasks roll to
   * their next occurrence and go back to Pending; one-time tasks stay Completed.
   */
  const completeTaskOccurrence = async (task: Task, notes: string) => {
    const now = new Date();
    const patch: Record<string, unknown> = {
      status: 'pending',
      completion_notes: notes.trim() || null,
      completed_by: profile?.id ?? null,
      acknowledged_completion: true,
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    if (task.frequency !== 'one-time') {
      const next = computeNextDueDate(task, now);
      if (next) {
        patch.next_due_date = next.toISOString();
        patch.last_occurrence_date = toDateKey(next);
        patch.occurrence_count = (task.occurrence_count ?? 0) + 1;
      }
    }
    const { data, error: err } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', task.id)
      .select()
      .single();
    if (err) return { error: err.message };
    setTasks((prev) => sortTasks(prev.map((t) => (t.id === task.id ? (data as Task) : t))));
    return { data };
  };

  /** Reopen a completed one-time task (assigned user or admin). */
  const reopenTask = async (task: Task) => {
    const { data, error: err } = await supabase
      .from('tasks')
      .update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
        acknowledged_completion: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
      .select()
      .single();
    if (err) return { error: err.message };
    setTasks((prev) => sortTasks(prev.map((t) => (t.id === task.id ? (data as Task) : t))));
    return { data };
  };

  return {
    tasks: visibleTasks,
    myTasks,
    profiles,
    profileById,
    loading,
    error,
    stats,
    refetch: fetchData,
    createTask,
    updateTask,
    deleteTask,
    completeTaskOccurrence,
    reopenTask,
  };
}

export function formatDueDate(due: string | null): string {
  if (!due) return 'No due date';
  try {
    return format(parseISO(due), 'MMM d, yyyy');
  } catch {
    return due;
  }
}

export { effectiveStatus, effectiveDeadline };
