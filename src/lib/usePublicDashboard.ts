import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Profile, Task, TaskCategory, TaskLink } from './types';
import { resolveTaskStatus } from './recurrence';
import { effectiveDueDate } from './useTasks';

/**
 * Public Viewing Dashboard data.
 *
 * Previously the public page rendered hard-coded zeros and never re-fetched —
 * that is why it "did not change / update". This hook loads real rows and
 * subscribes to Postgres Changes so the board updates live.
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
      supabase.from('profiles').select('id,full_name,email,position,role'),
      supabase.from('task_categories').select('*').order('name'),
      supabase.from('task_links').select('*'),
      supabase.from('task_assignments').select('task_id,user_id'),
    ]);

    if (tasksRes.error) setError(tasksRes.error.message);

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
    ((assignsRes.data ?? []) as any[]).forEach((a) => {
      const arr = assignMap.get(a.task_id) ?? [];
      arr.push(a.user_id);
      assignMap.set(a.task_id, arr);
    });

    const list: Task[] = ((tasksRes.data ?? []) as any[]).map((r) => {
      const assignees: string[] =
        assignMap.get(r.id)?.length ? assignMap.get(r.id)! : r.assigned_to ? [r.assigned_to] : [];
      return {
        ...r,
        days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : [],
        repeat_forever: !!r.repeat_forever,
        assignees,
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

  const stats = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((t) => statusOf(t) === 'pending').length,
      completed: tasks.filter((t) => statusOf(t) === 'completed').length,
      overdue: tasks.filter((t) => statusOf(t) === 'overdue').length,
    }),
    [tasks, statusOf],
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
    prioritized,
    refetch: fetchData,
  };
}
