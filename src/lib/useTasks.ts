import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isBefore, startOfDay, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Profile, Task, TaskFrequency, TaskStatus } from '../lib/types';

export function useTasks(profile: Profile | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const profilesMapRef = useRef<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const [tasksRes, profilesRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    if (tasksRes.error) {
      setError(tasksRes.error.message);
    } else {
      setTasks((tasksRes.data ?? []) as Task[]);
    }

    if (!profilesRes.error) {
      const list = (profilesRes.data ?? []) as Profile[];
      setProfiles(list);
      const map = new Map<string, Profile>();
      list.forEach((p) => map.set(p.id, p));
      profilesMapRef.current = map;
    }

    setLoading(false);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  /** Tasks visible to the current user under RLS. */
  const visibleTasks = tasks;

  /** Tasks assigned to the current user. */
  const myTasks = useMemo(
    () => tasks.filter((t) => t.assigned_to === profile?.id),
    [tasks, profile],
  );

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const count = (list: Task[]) => ({
      total: list.length,
      pending: list.filter((t) => t.status === 'pending').length,
      inProgress: list.filter((t) => t.status === 'in-progress').length,
      completed: list.filter((t) => t.status === 'completed').length,
      overdue: list.filter(
        (t) =>
          t.status !== 'completed' &&
          t.due_date &&
          isBefore(parseISO(t.due_date), today),
      ).length,
    });
    return { mine: count(myTasks), all: count(visibleTasks) };
  }, [myTasks, visibleTasks]);

  // ---------- Mutations ----------

  const createTask = async (input: {
    title: string;
    description?: string;
    due_date?: string | null;
    frequency?: TaskFrequency;
    assigned_to: string;
  }) => {
    const row = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.due_date ? new Date(input.due_date).toISOString() : null,
      frequency: input.frequency ?? 'one-time',
      status: 'pending' as TaskStatus,
      assigned_to: input.assigned_to,
      assigned_by: profile?.id ?? null,
    };
    const { data, error: err } = await supabase
      .from('tasks')
      .insert(row)
      .select()
      .single();
    if (err) return { error: err.message };
    const withAssignee = {
      ...(data as Task),
      assignee: (() => {
        const p = profilesMapRef.current.get((data as Task).assigned_to);
        return p ? { full_name: p.full_name, office: p.office, role: p.role } : null;
      })(),
    };
    setTasks((prev) =>
      [withAssignee, ...prev].sort((a, b) =>
        (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'),
      ),
    );
    return { data: withAssignee };
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { data, error: err } = await supabase
      .from('tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (err) return { error: err.message };
    setTasks((prev) => prev.map((t) => (t.id === id ? (data as Task) : t)));
    return { data };
  };

  const deleteTask = async (id: string) => {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err) return { error: err.message };
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return {};
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
