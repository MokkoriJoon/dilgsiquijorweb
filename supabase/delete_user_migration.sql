-- =====================================================================
-- DELETE USER → deletes the LOGIN (auth account) but PRESERVES content
-- ---------------------------------------------------------------------
-- Run this ONCE in Supabase → SQL Editor (idempotent, safe to re-run).
-- It accompanies the `admin_delete_user` RPC used by
-- Superadmin → User Management → Delete.
--
-- Behaviour after this migration:
--   • STANDARD user deleted  → their auth login is removed and their
--     PERSONAL items (personal tasks, personal categories, bookmarks,
--     avatar files) are deleted — those only ever existed for them.
--   • ADMIN / SUPER_ADMIN deleted → their auth login is removed too,
--     but everything they made / uploaded / edited on the website
--     (organization tasks, categories, announcements, links…) is KEPT.
--     Attribution columns fall back to '—' via ON DELETE SET NULL.
-- =====================================================================

-- 1) STOP org-wide content from being destroyed when a profile goes away.
--    Only rows explicitly marked `is_personal` (and private data like
--    bookmarks / assignment-join rows) will still cascade-delete.

-- tasks.created_by — new attribution column (keeps "who created it" even
-- after that user's login is deleted; SET NULL just hides the name).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

-- assigned_to was NOT NULL + CASCADE → an org task would vanish with its
-- admin. Relax it: keep the task, null the assignee, drop the FK cascade.
DO $$
BEGIN
  ALTER TABLE public.tasks ALTER COLUMN assigned_to DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
-- Drop & recreate the assigned_to FK without cascade.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                        AND att.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.tasks'::regclass
      AND con.contype  = 'f'
      AND att.attname  = 'assigned_to'
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
END $$;

-- owner_id (tasks + task_categories): CASCADE kept for PERSONAL rows only,
-- so we switch the FK to SET NULL and let the RPC below delete the personal
-- rows explicitly before removing the login.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname, con.conrelid::regclass AS tbl
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                        AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND att.attname = 'owner_id'
      AND con.conrelid IN ('public.tasks'::regclass, 'public.task_categories'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %s_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL',
      r.tbl, r.tbl);
  END LOOP;
END $$;

-- task_assignments.user_id — join table; dropping the user should remove
-- only the assignment rows, never the task itself. Keep CASCADE (correct),
-- but make sure the task-side FK also cascades (it already does).

-- task_categories.created_by / announcements.author_id are already
-- ON DELETE SET NULL — nothing to change there.

-- 2) SECURITY DEFINER RPC: SUPER_ADMIN deletes a user's LOGIN completely.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  -- Only SUPER_ADMIN may delete accounts.
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN can delete users';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  IF v_target_role = 'STANDARD' THEN
    -- Personal items belonged to this person alone → remove them.
    DELETE FROM public.tasks
      WHERE is_personal AND owner_id = p_user_id;
    DELETE FROM public.task_categories
      WHERE is_personal AND owner_id = p_user_id;
    DELETE FROM public.bookmarks WHERE user_id = p_user_id;
  END IF;
  -- ADMIN / SUPER_ADMIN: NOTHING they created/edited/uploaded is touched.
  -- Organization tasks, categories, announcements etc. survive; authorship
  -- columns fall back to NULL ('—') through ON DELETE SET NULL.

  -- Remove the avatar file(s) from Storage (best-effort).
  BEGIN
    DELETE FROM storage.objects
      WHERE bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = p_user_id::text;
  EXCEPTION WHEN others THEN NULL;
  END IF;

  -- Delete the login itself. The profiles row disappears via the existing
  -- `ON DELETE CASCADE` FK (profiles.id → auth.users.id).
  DELETE FROM auth.users WHERE id = p_user_id;

  -- Safety net for any orphaned profile row.
  DELETE FROM public.profiles WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
