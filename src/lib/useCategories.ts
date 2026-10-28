import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Profile, ResourceLink, Task, TaskCategory } from './types';
import { BOOKMARK_STORAGE_PREFIX } from './types';
import { effectiveStatus } from './recurrence';

export function useCategories() {
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('task_categories')
      .select('*')
      .order('name');
    if (err) setError(err.message);
    else {
      setError(null);
      setCategories((data ?? []) as TaskCategory[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const createCategory = async (input: {
    name: string;
    description?: string;
    color?: string;
    createdBy?: string | null;
  }) => {
    const { data, error: err } = await supabase
      .from('task_categories')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color ?? '#2563eb',
        created_by: input.createdBy ?? null,
      })
      .select()
      .single();
    if (err) return { error: err.message };
    setCategories((prev) =>
      [...prev, data as TaskCategory].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return { data };
  };

  const updateCategory = async (id: string, patch: Partial<TaskCategory>) => {
    const { data, error: err } = await supabase
      .from('task_categories')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (err) return { error: err.message };
    setCategories((prev) => prev.map((c) => (c.id === id ? (data as TaskCategory) : c)));
    return { data };
  };

  const deleteCategory = async (id: string) => {
    const { error: err } = await supabase
      .from('task_categories')
      .delete()
      .eq('id', id);
    if (err) return { error: err.message };
    setCategories((prev) => prev.filter((c) => c.id !== id));
    return {};
  };

  const categoryById = useMemo(() => {
    const map = new Map<string, TaskCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  return {
    categories,
    categoryById,
    loading,
    error,
    refetch: fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}

/**
 * Personal bookmarks + aggregated resource links.
 * Bookmarks are stored in Supabase `user_bookmarks` when available and always
 * mirrored to localStorage so they work even without the DB table yet.
 */
export function useBookmarks(profile: Profile | null) {
  const storageKey = BOOKMARK_STORAGE_PREFIX + (profile?.id ?? 'anon');

  const readLocal = useCallback((): ResourceLink[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as ResourceLink[]) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const [bookmarks, setBookmarks] = useState<ResourceLink[]>(readLocal);
  const [synced, setSynced] = useState(false);

  // Pull from DB once per user, fall back silently to local.
  useEffect(() => {
    if (!profile?.id) return;
    let mounted = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('user_bookmarks')
        .select('title,url')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: true });
      if (!mounted) return;
      if (!err && data) {
        const list = data as ResourceLink[];
        setBookmarks(list);
        try {
          localStorage.setItem(storageKey, JSON.stringify(list));
        } catch {
          /* ignore */
        }
      } else {
        setBookmarks(readLocal());
      }
      setSynced(true);
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.id, storageKey, readLocal]);

  const persist = useCallback(
    async (next: ResourceLink[]): Promise<string | null> => {
      setBookmarks(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (profile?.id) {
        try {
          const { error: err } = await supabase
            .from('user_bookmarks')
            .delete()
            .eq('user_id', profile.id);
          if (err) return err.message;
          if (next.length > 0) {
            const { error: err2 } = await supabase.from('user_bookmarks').insert(
              next.map((l) => ({
                user_id: profile.id,
                title: l.title,
                url: l.url,
              })),
            );
            if (err2) return err2.message;
          }
        } catch {
          /* offline — local copy already saved */
        }
      }
      return null;
    },
    [profile?.id, storageKey],
  );

  const addBookmark = async (link: ResourceLink) => {
    if (!link.url.trim()) return { error: 'URL is required.' };
    const exists = bookmarks.some(
      (b) => b.url.trim().toLowerCase() === link.url.trim().toLowerCase(),
    );
    if (exists) return { error: 'You already bookmarked this link.' };
    const normalized: ResourceLink = {
      title: link.title.trim() || link.url.trim(),
      url: /^https?:\/\//i.test(link.url.trim())
        ? link.url.trim()
        : `https://${link.url.trim()}`,
    };
    return { error: await persist([...bookmarks, normalized]) };
  };

  const removeBookmark = async (url: string) => {
    return {
      error: await persist(
        bookmarks.filter((b) => b.url.toLowerCase() !== url.toLowerCase()),
      ),
    };
  };

  return { bookmarks, addBookmark, removeBookmark, synced };
}

/** All distinct resource links coming from tasks visible to the user. */
export function collectTaskLinks(tasks: Task[], onlyMineFor?: string | null) {
  const seen = new Set<string>();
  const out: { link: ResourceLink; task: Task }[] = [];
  tasks.forEach((t) => {
    if (onlyMineFor && !(t.assignee_ids ?? []).includes(onlyMineFor)) return;
    if (effectiveStatus(t) === 'completed') return;
    (t.links ?? []).forEach((l) => {
      const key = l.url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ link: l, task: t });
      }
    });
  });
  return out;
}
