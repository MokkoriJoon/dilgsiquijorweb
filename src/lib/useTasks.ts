import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, isBefore, startOfDay, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { friendlyDbError } from './dbErrors';
import type { Profile, Task, TaskAssignment, TaskCategory, TaskFrequency, TaskLink } from '../lib/types';
import { isAdminOrAbove } from '../lib/types';
import { resolveTaskStatus, nextOccurrence } from './recurrence';

/** Columns selected from the tasks table. */
const TASK_SELECT =
  'id,title,description,due_date,start_date,frequency,days_of_week,repeat_forever,status,assigned_to,assigned_by,category_id,is_personal,owner_id,created_at,updated_at,completed_at,completion_note,completed_by';

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
      // Personal categories carry is_personal/owner_id; RLS (schema.sql) only
      // returns them to their owner, so other users never see or count them.
      supabase
        .from('task_categories')
        .select('id,name,color,description,created_by,is_personal,owner_id,created_at')
        .order('name'),
      supabase.from('task_links').select('*').order('label'),
      // Per-user completion columns may not exist yet in the DB — fall back
      // to the legacy select so the app never breaks mid-migration.
      supabase
        .from('task_assignments')
        .select('task_id,user_id,completed,completed_at,completion_note,completed_by')
        .then(async (res) => {
          if (!res.error) return res;
          return supabase.from('task_assignments').select('task_id,user_id');
        }),
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
    const assignmentRows = new Map<string, TaskAssignment[]>();
    if (!assignsRes.error) {
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
    }

    if (tasksRes.error) {
      setError(friendlyDbError(tasksRes.error.message));
    } else {
      const rows = (tasksRes.data ?? []) as any[];
      const list: Task[] = rows.map((r) => {
        const assignees: string[] =
          assignMap.get(r.id) && assignMap.get(r.id)!.length > 0
            ? assignMap.get(r.id)!
            : r.assigned_to
              ? [r.assigned_to]
              : [];
        // If the whole task is COMPLETED, every assignment counts as done —
        // keeps per-assignee stats consistent even before the join-table
        // migration backfill has run.
        const taskDone = r.status === 'completed';
        const category = r.category_id ? catMap.get(r.category_id) ?? null : null;
        const rawRows: TaskAssignment[] = assignmentRows.get(r.id) ?? [];
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

  /** How many tasks use each category (for the Categories page). */
  const categoryTaskCount = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.category_id) map.set(t.category_id, (map.get(t.category_id) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  /** Tasks visible to the current user under RLS — EXCLUDING other people's
   *  personal tasks (an admin may still see their own personal tasks). */
  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) => !t.is_personal || t.assigned_to === profile?.id || (t.assignees ?? []).includes(profile?.id ?? ''),
      ),
    [tasks, profile],
  );

  /** Organization-wide tasks (everything except personal tasks). */
  const orgTasks = useMemo(() => tasks.filter((t) => !t.is_personal), [tasks]);

  /** Tasks assigned to the current user (multiple users per task supported). */
  const myTasks = useMemo(
    () =>
      visibleTasks.filter(
        (t) => t.assigned_to === profile?.id || (t.assignees ?? []).includes(profile?.id ?? ''),
      ),
    [visibleTasks, profile],
  );

  /** Assigned ORGANIZATION tasks of the current user (excludes personal ones). */
  const assignedTasks = useMemo(() => myTasks.filter((t) => !t.is_personal), [myTasks]);

  /** The current user's PERSONAL tasks — private, never counted system-wide. */
  const personalTasks = useMemo(() => myTasks.filter((t) => !!t.is_personal), [myTasks]);

  // ---------- Categories (organization vs personal) ----------

  /** True when a category row belongs to the current user personally. */
  const isOwnPersonalCategory = useCallback(
    (c: TaskCategory) => !!c.is_personal && c.owner_id === profile?.id,
    [profile?.id],
  );

  /** ORGANIZATION categories only — what admins manage & what is counted
   *  system-wide. Personal categories are NEVER included here. */
  const orgCategories = useMemo(
    () => categories.filter((c) => !c.is_personal),
    [categories],
  );

  /** The current user's OWN personal categories (private). */
  const personalCategories = useMemo(
    () => categories.filter(isOwnPersonalCategory),
    [categories, isOwnPersonalCategory],
  );

  /** Categories usable by the current user: organization + own personal ones.
   *  Other people's personal categories are invisible/unselectable. */
  const categoriesForTasks = useMemo(
    () => categories.filter((c) => !c.is_personal || isOwnPersonalCategory(c)),
    [categories, isOwnPersonalCategory],
  );

  /** Effective (derived) status right now: completed | pending | overdue. */
  const statusOf = useCallback((t: Task) => resolveTaskStatus(t), []);

  // ---------- Per-assignee counting ----------
  // When N users are assigned to ONE task, the dashboard cards count that
  // task N times — once per assignee — and each assignment carries its own
  // completion / pending / overdue state.

  /** All (task, user) assignment slices of a task list. */
  const slicesOf = useCallback(
    (list: Task[]): { task: Task; user_id: string; completed: boolean }[] => {
      const out: { task: Task; user_id: string; completed: boolean }[] = [];
      for (const t of list) {
        const rows: TaskAssignment[] =
          t.assignments && t.assignments.length > 0
            ? t.assignments
            : (t.assignees ?? [t.assigned_to]).map((u) => ({ task_id: t.id, user_id: u, completed: false }));
        // De-duplicate by user (legacy column + join table can repeat).
        const seen = new Set<string>();
        for (const a of rows) {
          if (!a.user_id || seen.has(a.user_id)) continue;
          seen.add(a.user_id);
          out.push({ task: t, user_id: a.user_id, completed: !!a.completed });
        }
      }
      return out;
    },
    [],
  );

  /** Count a list of tasks per ASSIGNEE (a task with 3 users counts 3×). */
  const countPerAssignee = useCallback(
    (list: Task[]) => {
      const sl = slicesOf(list);
      return {
        total: sl.length,
        completed: sl.filter((s) => s.completed).length,
        pending: sl.filter((s) => !s.completed && statusOf(s.task) === 'pending').length,
        overdue: sl.filter((s) => !s.completed && statusOf(s.task) === 'overdue').length,
      };
    },
    [slicesOf, statusOf],
  );

  const stats = useMemo(() => {
    return {
      mine: countPerAssignee(assignedTasks),
      all: countPerAssignee(orgTasks),
      personal: count(personalTasks),
    };
    function count(list: Task[]) {
      return {
        total: list.length,
        completed: list.filter((t) => statusOf(t) === 'completed').length,
        pending: list.filter((t) => statusOf(t) === 'pending').length,
        overdue: list.filter((t) => statusOf(t) === 'overdue').length,
      };
    }
  }, [assignedTasks, orgTasks, personalTasks, statusOf, countPerAssignee]);

  // ---------- Mutations ----------

  async function syncAssignments(taskId: string, userIds: string[]) {
    // Preserve each user's existing certification (per-assignee counting)
    // instead of blowing away the rows on every edit.
    const { data: existing } = await supabase
      .from('task_assignments')
      .select('task_id,user_id,completed,completed_at,completion_note,completed_by')
      .eq('task_id', taskId);
    const keep = new Map<string, any>();
    ((existing ?? []) as any[]).forEach((a) => keep.set(a.user_id, a));

    await supabase.from('task_assignments').delete().eq('task_id', taskId);
    if (userIds.length === 0) return;
    const rows = userIds.map((user_id) => {
      const prev = keep.get(user_id);
      return {
        task_id: taskId,
        user_id,
        assigned_by: profile?.id ?? null,
        completed: !!prev?.completed,
        completed_at: prev?.completed_at ?? null,
        completion_note: prev?.completion_note ?? null,
        completed_by: prev?.completed_by ?? null,
      };
    });
    // Columns may not exist yet mid-migration → fall back to the legacy insert.
    const { error: insErr } = await supabase.from('task_assignments').insert(rows);
    if (insErr) {
      await supabase
        .from('task_assignments')
        .insert(userIds.map((user_id) => ({ task_id: taskId, user_id, assigned_by: profile?.id ?? null })));
    }
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
    /** Personal task → only visible to its owner, never counted system-wide. */
    is_personal?: boolean;
  }) => {
    const admin = isAdminOrAbove(profile?.role);

    // ── PERMISSION: only Admins / Super Admins may create tasks for the
    //    system or the organization. Standard users may ONLY create personal
    //    tasks (private to themselves, excluded from every organization count).
    if (!admin && !input.is_personal) {
      return {
        error:
          'Standard users cannot create tasks for the system or the organization. Please save it as a Personal Task, or ask an Admin / Super Admin.',
      };
    }

    let assignees = dedupe([input.assigned_to, ...(input.assignees ?? [])].filter(Boolean));
    // Personal tasks belong exclusively to their creator/owner.
    if (input.is_personal && profile?.id) assignees = [profile.id];
    // Standard users can never assign a task to somebody else.
    if (!admin && profile?.id) assignees = assignees.filter((a) => a === profile.id);
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
      is_personal: !!input.is_personal,
      // Personal items carry their owner so RLS keeps them private.
      owner_id: input.is_personal ? profile?.id ?? null : null,
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
    patch: Partial<Omit<Task, 'links'>> & {
      assignees?: string[];
      links?: { label: string; url: string }[];
    },
  ) => {
    const payload: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'completed') {
      payload.completed_at = new Date().toISOString();
      payload.completed_by = profile?.id ?? null;
    }
    if (patch.status === 'pending') {
      payload.completed_at = null;
      payload.completed_by = null;
      payload.completion_note = null;
    }
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

  /** True when `userId` is assigned to the task (legacy column or join rows). */
  function isAssignedTo(t: Task, userId?: string | null): boolean {
    if (!userId) return false;
    return t.assigned_to === userId || (t.assignees ?? []).includes(userId);
  }

  /** Whether the CURRENT USER already certified their own assignment. */
  const myAssignmentDone = useCallback(
    (t: Task): boolean => {
      if (t.status === 'completed') return true;
      const me = profile?.id;
      if (!me) return false;
      const rows = t.assignments ?? [];
      const mine = rows.find((a) => a.user_id === me);
      return !!mine?.completed;
    },
    [profile?.id],
  );

  /**
   * Mark a task complete.
   *  • Single-assignee task → completes the whole task (status flips to
   *    COMPLETED immediately — it must NOT stay Pending).
   *  • Multi-assignee task  → certifies ONLY the current user's slice; the
   *    task flips to COMPLETED automatically once every assignee has
   *    certified. Super Admins may certify/complete ANY task even when they
   *    are not assigned (it completes the whole task in one go).
   */
  const completeTask = async (id: string, ack: { acknowledged: boolean; note?: string }) => {
    if (!ack.acknowledged) {
      return { error: 'You must acknowledge responsibility before marking a task complete.' };
    }
    const target = tasks.find((x) => x.id === id);
    const isSuper = profile?.role === 'SUPER_ADMIN';
    if (target && profile?.id) {
      const mine = isAssignedTo(target, profile.id);
      if (!mine && !isSuper) {
        return { error: 'Only users assigned to this task can mark it as complete.' };
      }
    }

    const nowIso = new Date().toISOString();
    const assignees = target ? dedupe(target.assignees?.length ? target.assignees : [target.assigned_to]) : [];

    // Multi-assignee org task + acting user is an assignee (not a Super
    // Admin force-complete) → per-user certification first.
    if (
      target &&
      !target.is_personal &&
      assignees.length > 1 &&
      profile?.id &&
      isAssignedTo(target, profile.id) &&
      !isSuper
    ) {
      const { error: upErr } = await supabase
        .from('task_assignments')
        .update({ completed: true, completed_at: nowIso, completion_note: ack.note?.trim() || null, completed_by: profile.id })
        .eq('task_id', id)
        .eq('user_id', profile.id);
      if (upErr) return { error: friendlyDbError(upErr.message) };

      const doneIds = new Set(
        (target.assignments ?? []).filter((a) => a.completed || a.user_id === profile.id).map((a) => a.user_id),
      );
      const allDone = assignees.every((u) => doneIds.has(u));
      if (allDone) {
        const { error: tErr } = await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: nowIso, completed_by: profile.id, updated_at: nowIso })
          .eq('id', id);
        if (tErr) return { error: tErr.message };
      }
      await fetchData();
      return {};
    }

    // Otherwise (single assignee, personal task, or Super Admin) → complete
    // the entire task and mark every assignment row as certified.
    const { error: err } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: nowIso,
        completed_by: profile?.id ?? null,
        completion_note: ack.note?.trim() || null,
        updated_at: nowIso,
      })
      .eq('id', id);
    if (err) return { error: err.message };
    await supabase
      .from('task_assignments')
      .update({ completed: true, completed_at: nowIso, completed_by: profile?.id ?? null })
      .eq('task_id', id);
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
    // Clear every per-user certification too so the slices count as pending.
    await supabase
      .from('task_assignments')
      .update({ completed: false, completed_at: null, completion_note: null, completed_by: null })
      .eq('task_id', id);
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
    /** Personal category → visible only to its owner, never counted system-wide. */
    is_personal?: boolean;
  }) => {
    if (!input.name.trim()) return { error: 'Category name is required.' };
    // Only Admins / Super Admins may raise ORGANIZATION categories; everyone
    // may create their own PRIVATE personal categories.
    if (!input.is_personal && !isAdminOrAbove(profile?.role)) {
      return {
        error:
          'Standard users cannot create organization categories. Please create a Personal Category instead.',
      };
    }
    // Client-side guard first (case-insensitive): org names must be unique
    // across ORGANIZATION categories; personal names only across MY OWN ones.
    const wanted = input.name.trim().toLowerCase();
    const clash = categories.some(
      (c) =>
        c.name.trim().toLowerCase() === wanted &&
        (!!c.is_personal === !!input.is_personal) &&
        (!input.is_personal || c.owner_id === profile?.id),
    );
    if (clash) {
      return {
        error: `Category “${input.name.trim()}” already exists${
          input.is_personal ? ' in your personal categories' : ''
        }. Please choose a different name.`,
      };
    }

    const { error: err } = await supabase.from('task_categories').insert({
      name: input.name.trim(),
      color: input.color ?? null,
      description: input.description?.trim() || null,
      created_by: profile?.id ?? null,
      is_personal: !!input.is_personal,
      owner_id: input.is_personal ? profile?.id ?? null : null,
    });
    if (err) {
      // Surface raw DB errors like `duplicate key value violates unique
      // constraint "task_categories_name_key"` as a friendly message.
      if (/duplicate key/i.test(err.message)) {
        return {
          error: `Category “${input.name.trim()}” already exists. Please choose a different name.`,
        };
      }
      return { error: friendlyDbError(err.message) };
    }
    await fetchData();
    return {};
  };

  /** Edit a category's title / description / colour (admins for org
   *  categories; owners for their own personal ones). */
  const updateCategory = async (id: string, patch: Partial<TaskCategory>) => {
    // Duplicate-name check on rename (case-insensitive, scoped the same way
    // as the DB unique indexes: org-wide vs per-owner personal).
    const target = categories.find((c) => c.id === id);
    if (patch.name !== undefined && target) {
      const wanted = patch.name.trim().toLowerCase();
      const clash = categories.some(
        (c) =>
          c.id !== id &&
          c.name.trim().toLowerCase() === wanted &&
          (!!c.is_personal === !!target.is_personal) &&
          (!target.is_personal || c.owner_id === target.owner_id),
      );
      if (clash) {
        return { error: `Category “${patch.name.trim()}” already exists. Please choose a different name.` };
      }
    }
    const clean: Record<string, any> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.description !== undefined) clean.description = patch.description?.trim() || null;
    if (patch.color !== undefined) clean.color = patch.color || null;

    const { error: err } = await supabase.from('task_categories').update(clean).eq('id', id);
    if (err) {
      if (/duplicate key/i.test(err.message)) {
        return { error: 'That category name is already taken. Please choose a different name.' };
      }
      return { error: friendlyDbError(err.message) };
    }
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
    orgTasks,
    myTasks,
    assignedTasks,
    personalTasks,
    profiles,
    // `categories` stays the RAW fetch result (never undefined) so every
    // consumer can safely call `.map()` on it. Use the derived lists below:
    categories,
    orgCategories,
    personalCategories,
    categoriesForTasks,
    links,
    profileById,
    categoryById,
    categoryTaskCount,
    loading,
    error,
    stats,
    statusOf,
    countPerAssignee,
    myAssignmentDone,
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

/**
 * Calendar days from TODAY until the task's effective deadline.
 * Negative = overdue by N days. Null when the task has no due date.
 * Used by the reminder/notification system ("due 1 day before", "overdue").
 */
export function daysUntilEffectiveDeadline(t: Task, now: Date = new Date()): number | null {
  const due = effectiveDueDate(t);
  if (!due || due === '9999-12-31') return null;
  const dueDay = startOfDay(parseISO(due));
  return Math.round((dueDay.getTime() - startOfDay(now).getTime()) / 86_400_000);
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
