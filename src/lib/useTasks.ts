import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, isBefore, startOfDay, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Profile, Task, TaskCategory, TaskFrequency, TaskLink } from '../lib/types';
import { resolveTaskStatus, nextOccurrence } from './recurrence';

/** Columns selected from the tasks table. */
const TASK_SELECT =
  'id,title,description,due_date,start_date,frequency,days_of_week,repeat_forever,status,assigned_to,assigned_by,category_id,created_at,updated_at,completed_at,completion_note,completed_by';

interface LinkRow {
  id: string;
  task_id: string;
  label: string;
  url: string;
}

export function useTasks(profile: Profile | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const [tasksRes, profilesRes, catsRes, linksRes, assignsRes] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('task_categories').select('*').order('name'),
      supabase.from('task_links').select('*').order('label'),
      supabase.from('task_assignments').select('task_id,user_id'),
    ]);

    const pmap = new Map<string, Profile>();
    if (!profilesRes.error) {
      ((profilesRes.data ?? []) as Profile[]).forEach((p) => pmap.set(p.id, p));
      setProfiles(profilesRes.data as Profile[]);
    }

    const catMap = new Map<string, TaskCategory>();
    if (!catsRes.error) {
      ((catsRes.data ?? []) as TaskCategory[]).forEach((c) => catMap.set(c.id, c));
      setCategories((catsRes.data ?? []) as TaskCategory[]);
    }

    const linkMap = new Map<string, TaskLink[]>();
    if (!linksRes.error) {
      const rows = (linksRes.data ?? []) as LinkRow[];
      setLinks(rows);
      rows.forEach((l) => {
        const arr = linkMap.get(l.task_id) ?? [];
        arr.push({ id: l.id, task_id: l.task_id, label: l.label, url: l.url });
        linkMap.set(l.task_id, arr);
      });
    }

    const assignMap = new Map<string, string[]>();
    if (!assignsRes.error) {
      ((assignsRes.data ?? []) as { task_id: string; user_id: string }[]).forEach((a) => {
        const arr = assignMap.get(a.task_id) ?? [];
        arr.push(a.user_id);
        assignMap.set(a.task_id, arr);
      });
    }

    if (tasksRes.error) {
      setError(tasksRes.error.message);
    } else {
      const rows = (tasksRes.data ?? []) as any[];
      const list: Task[] = rows.map((r) => {
        const assignees: string[] =
          assignMap.get(r.id) && assignMap.get(r.id)!.length > 0
            ? assignMap.get(r.id)!
            : r.assigned_to
              ? [r.assigned_to]
              : [];
        const category = r.category_id ? catMap.get(r.category_id) ?? null : null;
        return {
          ...r,
          days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : [],
          repeat_forever: !!r.repeat_forever,
          assignees,
          assignee_profiles: assignees.map((id) => pmap.get(id)).filter(Boolean) as Profile[],
          assignee: (() => {
            const p = pmap.get(r.assigned_to);
            return p ? { full_name: p.full_name, position: p.position, role: p.role } : null;
          })(),
          links: linkMap.get(r.id) ?? [],
          category,
        } as Task;
      });

      // Order by the *effective* next deadline so overdue items float to the top.
      list.sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)));
      setTasks(list);
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

  const categoryById = useMemo(() => {
    const map = new Map<string, TaskCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  /** Tasks visible to the current user under RLS. */
  const visibleTasks = tasks;

  /** Tasks assigned to the current user (multiple users per task supported). */
  const myTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.assigned_to === profile?.id || (t.assignees ?? []).includes(profile?.id ?? ''),
      ),
    [tasks, profile],
  );

  /** Effective (derived) status right now: completed | pending | overdue. */
  const statusOf = useCallback((t: Task) => resolveTaskStatus(t), []);

  const stats = useMemo(() => {
    const count = (list: Task[]) => ({
      total: list.length,
      completed: list.filter((t) => statusOf(t) === 'completed').length,
      pending: list.filter((t) => statusOf(t) === 'pending').length,
      overdue: list.filter((t) => statusOf(t) === 'overdue').length,
    });
    return { mine: count(myTasks), all: count(visibleTasks) };
  }, [myTasks, visibleTasks, statusOf]);

  // ---------- Mutations ----------

  async function syncAssignments(taskId: string, userIds: string[]) {
    await supabase.from('task_assignments').delete().eq('task_id', taskId);
    if (userIds.length === 0) return;
    const rows = userIds.map((user_id) => ({
      task_id: taskId,
      user_id,
      assigned_by: profile?.id ?? null,
    }));
    await supabase.from('task_assignments').insert(rows);
  }

  async function syncLinks(taskId: string, input: { label: string; url: string }[]) {
    const cleaned = input
      .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
      .filter((l) => l.label && l.url);
    const { error: delErr } = await supabase.from('task_links').delete().eq('task_id', taskId);
    if (delErr) return delErr.message;
    if (cleaned.length === 0) return undefined;
    const { error: insErr } = await supabase
      .from('task_links')
      .insert(cleaned.map((l) => ({ ...l, task_id: taskId })));
    return insErr?.message;
  }

  /** Create a task with multiple assignees, a category, recurrence rules + links. */
  const createTask = async (input: {
    title: string;
    description?: string | null;
    due_date?: string | null;
    frequency?: TaskFrequency;
    days_of_week?: number[];
    repeat_forever?: boolean;
    category_id?: string | null;
    assigned_to: string;
    assignees?: string[];
    links?: { label: string; url: string }[];
  }) => {
    const assignees = dedupe([input.assigned_to, ...(input.assignees ?? [])].filter(Boolean));
    if (assignees.length === 0) return { error: 'Select at least one assignee.' };

    const frequency = input.frequency ?? 'one-time';
    const dueIso = input.due_date ? new Date(input.due_date).toISOString() : null;

    const row: Record<string, any> = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: dueIso,
      start_date: dueIso,
      frequency,
      days_of_week: frequency === 'daily' ? (input.days_of_week ?? []) : [],
      repeat_forever: input.repeat_forever ?? true,
      status: 'pending',
      assigned_to: assignees[0],
      assigned_by: profile?.id ?? null,
      category_id: input.category_id || null,
    };

    const { data, error: err } = await supabase
      .from('tasks')
      .insert(row)
      .select(TASK_SELECT)
      .single();
    if (err) return { error: err.message };

    const created = data as Task;
    await syncAssignments(created.id, assignees);
    const linkErr = await syncLinks(created.id, input.links ?? []);
    if (linkErr) return { error: `Task created, but links failed to save: ${linkErr}` };

    await fetchData();
    return { data: created };
  };

  const updateTask = async (
    id: string,
    patch: Partial<Task> & {
      assignees?: string[];
      links?: { label: string; url: string }[];
    },
  ) => {
    const payload: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'completed') payload.completed_at = new Date().toISOString();
    if (patch.status === 'pending') payload.completed_at = null;
    delete (payload as any).assignees;
    delete (payload as any).links;
    delete (payload as any).assignee;
    delete (payload as any).assignee_profiles;
    delete (payload as any).category;

    const { error: err } = await supabase.from('tasks').update(payload).eq('id', id);
    if (err) return { error: err.message };

    if (patch.assignees) {
      const assignees = dedupe(patch.assignees.filter(Boolean));
      if (assignees.length > 0) {
        await supabase.from('tasks').update({ assigned_to: assignees[0] }).eq('id', id);
      }
      await syncAssignments(id, assignees);
    }
    if (patch.links) {
      const linkErr = await syncLinks(id, patch.links);
      if (linkErr) return { error: linkErr };
    }

    await fetchData();
    return {};
  };

  /**
   * Mark a task complete. Assigned users must explicitly acknowledge that they
   * are held responsible and liable once they certify a task as completed.
   */
  const completeTask = async (id: string, ack: { acknowledged: boolean; note?: string }) => {
    if (!ack.acknowledged) {
      return { error: 'You must acknowledge responsibility before marking a task complete.' };
    }
    const { error: err } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: profile?.id ?? null,
        completion_note: ack.note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (err) return { error: err.message };
    await fetchData();
    return {};
  };

  const reopenTask = async (id: string) => {
    const { error: err } = await supabase
      .from('tasks')
      .update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
        completion_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (err) return { error: err.message };
    await fetchData();
    return {};
  };

  const deleteTask = async (id: string) => {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err) return { error: err.message };
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return {};
  };

  // ---------- Categories ----------

  const createCategory = async (input: {
    name: string;
    color?: string;
    description?: string;
  }) => {
    if (!input.name.trim()) return { error: 'Category name is required.' };
    const { error: err } = await supabase.from('task_categories').insert({
      name: input.name.trim(),
      color: input.color ?? null,
      description: input.description?.trim() || null,
      created_by: profile?.id ?? null,
    });
    if (err) return { error: err.message };
    await fetchData();
    return {};
  };

  const updateCategory = async (id: string, patch: Partial<TaskCategory>) => {
    const { error: err } = await supabase.from('task_categories').update(patch).eq('id', id);
    if (err) return { error: err.message };
    await fetchData();
    return {};
  };

  const deleteCategory = async (id: string) => {
    await supabase.from('tasks').update({ category_id: null }).eq('category_id', id);
    const { error: err } = await supabase.from('task_categories').delete().eq('id', id);
    if (err) return { error: err.message };
    await fetchData();
    return {};
  };

  return {
    tasks: visibleTasks,
    myTasks,
    profiles,
    categories,
    links,
    profileById,
    categoryById,
    loading,
    error,
    stats,
    statusOf,
    refetch: fetchData,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    reopenTask,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}

/** The date a task is effectively due right now (next unfinished occurrence). */
export function effectiveDueDate(t: Task): string {
  const today = startOfDay(new Date());
  if (t.status === 'completed') return (t.due_date ?? '9999-12-31').slice(0, 10);
  if (t.frequency === 'one-time' || !t.due_date) {
    return (t.due_date ?? '9999-12-31').slice(0, 10);
  }
  const stored = t.due_date.slice(0, 10);
  if (isBefore(parseISO(stored), today)) return stored; // already overdue → sorts first
  const nxt = nextOccurrence(t, today);
  return nxt ? format(nxt, 'yyyy-MM-dd') : stored;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

export function normalizeUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function formatDueDate(due: string | null): string {
  if (!due) return 'No due date';
  try {
    return format(parseISO(due), 'MMM d, yyyy');
  } catch {
    return due;
  }
}
