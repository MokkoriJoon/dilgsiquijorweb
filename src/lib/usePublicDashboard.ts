import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { friendlyDbError } from './dbErrors';
import type { Profile, Task, TaskAssignment, TaskCategory, TaskLink } from './types';
import { resolveTaskStatus } from './recurrence';
import { effectiveDueDate } from './useTasks';

/** One (task, assignee) slice — the unit every PUBLIC count is based on. */
export interface AssignmentSlice {
  task: Task;
  user_id: string;
  completed: boolean;
}

/**
 * Public Viewing Dashboard data.
 *
 * Previously the public page rendered hard-coded zeros and never re-fetched —
 * that is why it "did not change / update". This hook loads real rows and
 * subscribes to Postgres Changes so the board updates live.
 *
 * COUNTING RULE (public/org view): a task assigned to N users counts as N
 * total tasks — one per assigned user — and each assignment carries its own
 * status (Complete once that user certified, Overdue while the deadline
 * passed un-certified, Pending otherwise). The personal "My Tasks / My
 * Dashboard" views keep counting MY slices only (1 per task for me).
 */
export function usePublicDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tasksRes, profilesRes, catsRes, linksRes, assignsRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      // Only the public fields the board actually needs — works even with
      // stricter profile RLS and never blocks the whole dashboard.
      supabase.from('profiles').select('id,full_name,email,position,role'),
      supabase.from('task_categories').select('*').order('name'),
      supabase.from('task_links').select('*'),
      // Per-user completion may not exist yet mid-migration → fall back.
      supabase
        .from('task_assignments')
        .select('task_id,user_id,completed,completed_at,completion_note,completed_by')
        .then(async (res) => {
          if (!res.error) return res;
          return supabase.from('task_assignments').select('task_id,user_id');
        }),
    ]);

    if (tasksRes.error) setError(friendlyDbError(tasksRes.error.message));
    else setError(null);

    const pmap = new Map<string, Profile>();
    ((profilesRes.data ?? []) as Profile[]).forEach((p) => pmap.set(p.id, p));
    setProfiles(Array.from(pmap.values()));

    const catMap = new Map<string, TaskCategory>();
    ((catsRes.data ?? []) as TaskCategory[]).forEach((c) => catMap.set(c.id, c));
    setCategories((catsRes.data ?? []) as TaskCategory[]);

    const linkMap = new Map<string, TaskLink[]>();
    ((linksRes.data ?? []) as any[]).forEach((l) => {
      const arr = linkMap.get(l.task_id) ?? [];
      arr.push({ id: l.id, task_id: l.task_id, label: l.label, url: l.url });
      linkMap.set(l.task_id, arr);
    });

    const assignMap = new Map<string, string[]>();
    const assignmentRows = new Map<string, TaskAssignment[]>();
    ((assignsRes.data ?? []) as any[]).forEach((a) => {
      const arr = assignMap.get(a.task_id) ?? [];
      arr.push(a.user_id);
      assignMap.set(a.task_id, arr);
      const rows = assignmentRows.get(a.task_id) ?? [];
      rows.push({
        task_id: a.task_id,
        user_id: a.user_id,
        completed: !!a.completed,
        completed_at: a.completed_at ?? null,
        completion_note: a.completion_note ?? null,
        completed_by: a.completed_by ?? null,
      });
      assignmentRows.set(a.task_id, rows);
    });

    const list: Task[] = ((tasksRes.data ?? []) as any[])
      .filter((r) => !r.is_personal) // personal tasks never appear on the public board
      .map((r) => {
        const assignees: string[] =
          assignMap.get(r.id)?.length ? assignMap.get(r.id)! : r.assigned_to ? [r.assigned_to] : [];
        // When the whole task is COMPLETED every assignment counts as done.
        const taskDone = r.status === 'completed';
        const rawRows = assignmentRows.get(r.id) ?? [];
        const asgRows: TaskAssignment[] = taskDone
          ? rawRows.map((a) => ({ ...a, completed: true }))
          : rawRows;
        return {
          ...r,
          days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : [],
          repeat_forever: !!r.repeat_forever,
          assignees,
          assignments:
            asgRows.length > 0
              ? asgRows
              : assignees.map((u) => ({ task_id: r.id, user_id: u, completed: taskDone })),
          assignee_profiles: assignees.map((id) => pmap.get(id)).filter(Boolean) as Profile[],
          category: r.category_id ? catMap.get(r.category_id) ?? null : null,
          links: linkMap.get(r.id) ?? [],
        } as Task;
      });

    list.sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)));
    setTasks(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Live updates: any insert/update/delete on tasks refreshes the board.
    const channel = supabase
      .channel('public-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_links' },
        () => fetchData(),
      )
      .subscribe();

    const timer = window.setInterval(fetchData, 60_000); // periodic safety refresh

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const statusOf = useCallback((t: Task) => resolveTaskStatus(t), []);

  /**
   * Every (task, assignee) slice of the board. A task assigned to N users
   * produces N slices — this is what makes the PUBLIC counts multiply by the
   * number of assigned users (per the counting rule above).
   */
  const slices = useMemo<AssignmentSlice[]>(() => {
    const out: AssignmentSlice[] = [];
    for (const t of tasks) {
      const rows: TaskAssignment[] =
        t.assignments && t.assignments.length > 0
          ? t.assignments
          : (t.assignees ?? []).map((u) => ({
              task_id: t.id,
              user_id: u,
              completed: t.status === 'completed',
            }));
      const seen = new Set<string>();
      for (const a of rows) {
        if (!a.user_id || seen.has(a.user_id)) continue;
        seen.add(a.user_id);
        out.push({ task: t, user_id: a.user_id, completed: !!a.completed });
      }
      // Unassigned org tasks still count as one task on the board.
      if (seen.size === 0) out.push({ task: t, user_id: '', completed: t.status === 'completed' });
    }
    return out;
  }, [tasks]);

  /** Slice-level effective status: per-user completion + task deadline. */
  const sliceStatusOf = useCallback(
    (s: AssignmentSlice): 'completed' | 'pending' | 'overdue' => {
      if (s.completed || s.task.status === 'completed') return 'completed';
      return resolveTaskStatus(s.task);
    },
    [],
  );

  /** Status cards counted PER ASSIGNMENT (a task with 3 users counts 3×). */
  const stats = useMemo(
    () => ({
      total: slices.length,
      pending: slices.filter((s) => sliceStatusOf(s) === 'pending').length,
      completed: slices.filter((s) => sliceStatusOf(s) === 'completed').length,
      overdue: slices.filter((s) => sliceStatusOf(s) === 'overdue').length,
    }),
    [slices, sliceStatusOf],
  );

  /** Overdue first, then due within 1 day, then within 3 days, then the rest. */
  const prioritized = useMemo(() => {
    const open = tasks.filter((t) => statusOf(t) !== 'completed');
    const rank = (t: Task) => {
      const s = statusOf(t);
      if (s === 'overdue') return 0;
      const due = effectiveDueDate(t);
      const today = new Date();
      const dd = Math.round(
        (new Date(`${due}T00:00:00`).getTime() - new Date(today.toDateString()).getTime()) /
          86_400_000,
      );
      if (dd <= 1) return 1; // within 1 day
      if (dd <= 3) return 2; // within 3 days
      return 3;
    };
    return [...open].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return effectiveDueDate(a).localeCompare(effectiveDueDate(b));
    });
  }, [tasks, statusOf]);

  return {
    tasks,
    profiles,
    categories,
    loading,
    error,
    stats,
    statusOf,
    slices,
    sliceStatusOf,
    prioritized,
    refetch: fetchData,
  };
}
