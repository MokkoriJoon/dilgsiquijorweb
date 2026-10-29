-- =====================================================================
-- D.E.N.N.I.S — Roles, Profiles & Tasks schema (Supabase SQL)
-- Run this in the Supabase SQL Editor. It is idempotent and safe to re-run.
--
-- v2 additions (fixes the "column/table does not exist" errors):
--   • tasks.start_date, days_of_week, repeat_forever, category_id,
--     completed_at, completion_note, completed_by
--   • task_categories, task_links, task_assignments, bookmarks,
--     site_settings tables + RLS policies
--   • pgcrypto extension (fixes: function gen_salt(unknown) does not exist)
-- =====================================================================

-- 0) REQUIRED EXTENSION — provides crypt() / gen_salt('bf') used by
--    admin_create_user() below. Supabase installs it in the extensions
--    schema; we also expose it in public so search_path always finds it.
-- Prefer the built-in schema; fall back to public if it does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
  END IF;
END $$;

-- The RPC below pins search_path = public, so make sure gen_salt/crypt are
-- reachable from public as well (thin wrappers around the extension schema).
DO $$
DECLARE ext_schema TEXT;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'gen_salt' LIMIT 1;

  IF ext_schema IS DISTINCT FROM 'public' THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.gen_salt(TEXT) RETURNS TEXT AS $fn$ SELECT %I.gen_salt($1) $fn$ LANGUAGE sql', ext_schema);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.crypt(TEXT, TEXT) RETURNS TEXT AS $fn$ SELECT %I.crypt($1, $2) $fn$ LANGUAGE sql', ext_schema);
  END IF;
END $$;

-- 1) PROFILES TABLE (with 3 user types: STANDARD, ADMIN, SUPER_ADMIN)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE,
  position TEXT,   -- Position / Designation (formerly "office")
  role TEXT NOT NULL DEFAULT 'STANDARD'
    CHECK (role IN ('STANDARD', 'ADMIN', 'SUPER_ADMIN')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: rename the legacy "office" column to "position" (safe to re-run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'profiles'
                AND column_name = 'office')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'profiles'
                AND column_name = 'position') THEN
    ALTER TABLE public.profiles RENAME COLUMN office TO position;
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2) TASKS TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  frequency TEXT DEFAULT 'one-time',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'in-progress', 'completed')),
  assigned_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 2b) MIGRATE LEGACY `tasks` TABLE — add the columns the app queries for.
--     (Fixes: "column tasks.start_date does not exist",
--             "Could not find the 'category_id' column of 'tasks'")
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date      TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS days_of_week     INTEGER[] DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS repeat_forever   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS category_id      UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completion_note  TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Relax the legacy status CHECK to the 3-state model used by the app.
DO $$
BEGIN
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('pending', 'in-progress', 'completed'));
END $$;

-- Backfill start_date from due_date for existing rows (recurrence anchor).
UPDATE public.tasks SET start_date = due_date WHERE start_date IS NULL AND due_date IS NOT NULL;

-- 2b') PERSONAL TASKS & PERSONAL CATEGORIES -----------------------------
-- Personal items are private to their owner: they are NEVER viewable,
-- selectable or counted system-wide (public board, dashboards, statistics).
ALTER TABLE public.tasks           ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tasks           ADD COLUMN IF NOT EXISTS owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.task_categories ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.task_categories ADD COLUMN IF NOT EXISTS owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_owner_personal     ON public.tasks (owner_id) WHERE is_personal;
CREATE INDEX IF NOT EXISTS idx_categories_owner_personal ON public.task_categories (owner_id) WHERE is_personal;

-- Legacy rows: personal tasks already carried assigned_to = owner.
UPDATE public.tasks SET owner_id = assigned_to WHERE is_personal AND owner_id IS NULL;

-- A personal category's name may repeat across users, so the org-wide unique
-- index only applies to ORGANIZATION categories now.
DROP INDEX IF EXISTS task_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS task_categories_org_name_key
  ON public.task_categories (lower(name)) WHERE NOT is_personal;
CREATE UNIQUE INDEX IF NOT EXISTS task_categories_personal_name_key
  ON public.task_categories (lower(name), owner_id) WHERE is_personal;

-- 2c) TASK CATEGORIES (used by the Categories page + the category dropdown)
CREATE TABLE IF NOT EXISTS public.task_categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT,
  description TEXT,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_category_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.task_categories(id) ON DELETE SET NULL;

-- 2d) TASK LINKS — resource links attached to a task
CREATE TABLE IF NOT EXISTS public.task_links (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2e) TASK ASSIGNMENTS — many users per task
CREATE TABLE IF NOT EXISTS public.task_assignments (
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

-- 2f) BOOKMARKS — personal (self-view) resource links per user
--     (Fixes: "Could not find the table 'public.bookmarks' in the schema cache")
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2g) SITE SETTINGS — single-row branding edited by SUPER_ADMIN
--     (Fixes: "Could not find the table 'public.site_settings' in the schema cache")
CREATE TABLE IF NOT EXISTS public.site_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name        TEXT,
  site_description TEXT,
  logo_url         TEXT,
  footer_text      TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
-- NOTE: VALUES (...) is required before the ON CONFLICT clause.
INSERT INTO public.site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Keep task_assignments in sync with the legacy single-assignee column.
CREATE OR REPLACE FUNCTION public.sync_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.task_assignments (task_id, user_id, assigned_by)
    VALUES (NEW.id, NEW.assigned_to, NEW.assigned_by)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_task_assignment ON public.tasks;
CREATE TRIGGER trg_sync_task_assignment
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_assignment();

-- Indexes for the common query paths
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to   ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_category      ON public.tasks (category_id);
CREATE INDEX IF NOT EXISTS idx_task_links_task     ON public.task_links (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_user    ON public.task_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user      ON public.bookmarks (user_id);

-- 2h) RLS POLICIES — new tables
ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories viewable by authenticated" ON public.task_categories;
DROP POLICY IF EXISTS "Categories publicly readable" ON public.task_categories;
-- Organization categories are readable by everyone; PERSONAL categories only
-- by their owner (never viewable or counted system-wide).
CREATE POLICY "Categories publicly readable"
  ON public.task_categories FOR SELECT
  TO public
  USING (NOT is_personal OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage categories" ON public.task_categories;
CREATE POLICY "Admins manage categories"
  ON public.task_categories FOR ALL TO authenticated
  USING (public.get_current_role() IN ('ADMIN','SUPER_ADMIN'))
  WITH CHECK (public.get_current_role() IN ('ADMIN','SUPER_ADMIN'));
-- Every authenticated user may manage their OWN personal categories.
DROP POLICY IF EXISTS "Users manage own personal categories" ON public.task_categories;
CREATE POLICY "Users manage own personal categories"
  ON public.task_categories FOR ALL TO authenticated
  USING (is_personal AND owner_id = auth.uid())
  WITH CHECK (is_personal AND owner_id = auth.uid());

DROP POLICY IF EXISTS "Links viewable by authenticated" ON public.task_links;
DROP POLICY IF EXISTS "Links publicly readable" ON public.task_links;
CREATE POLICY "Links publicly readable"
  ON public.task_links FOR SELECT
  TO public
  USING (true);
DROP POLICY IF EXISTS "Task managers can edit links" ON public.task_links;
CREATE POLICY "Task managers can edit links"
  ON public.task_links FOR ALL TO authenticated
  USING (
    public.get_current_role() IN ('ADMIN','SUPER_ADMIN')
    OR EXISTS (SELECT 1 FROM public.tasks t
               WHERE t.id = task_links.task_id AND t.assigned_to = auth.uid())
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMIN','SUPER_ADMIN')
    OR EXISTS (SELECT 1 FROM public.tasks t
               WHERE t.id = task_links.task_id AND t.assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "Assignments viewable by authenticated" ON public.task_assignments;
DROP POLICY IF EXISTS "Assignments publicly readable" ON public.task_assignments;
CREATE POLICY "Assignments publicly readable"
  ON public.task_assignments FOR SELECT
  TO public
  USING (true);
DROP POLICY IF EXISTS "Task managers can edit assignments" ON public.task_assignments;
CREATE POLICY "Task managers can edit assignments"
  ON public.task_assignments FOR ALL TO authenticated
  USING (
    public.get_current_role() IN ('ADMIN','SUPER_ADMIN')
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tasks t
               WHERE t.id = task_assignments.task_id AND t.assigned_to = auth.uid())
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMIN','SUPER_ADMIN')
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tasks t
               WHERE t.id = task_assignments.task_id AND t.assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users manage own bookmarks"
  ON public.bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Site settings readable by all" ON public.site_settings;
CREATE POLICY "Site settings readable by all"
  ON public.site_settings FOR SELECT USING (true);  -- public branding on login page
DROP POLICY IF EXISTS "Super admins edit site settings" ON public.site_settings;
CREATE POLICY "Super admins edit site settings"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.get_current_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_current_role() = 'SUPER_ADMIN');

-- 2h2) ANNOUNCEMENTS — notices posted by ADMIN / SUPER_ADMIN only.
--      NOT tasks: no completion status, never counted in any task totals or
--      statistics anywhere in the system (they live in their own table).
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,                -- WHAT (headline) — REQUIRED to publish
  body        TEXT DEFAULT '',              -- WHAT (details) — optional
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  -- 5W1H extras: only WHAT (title) is required; these stay optional (NULL ok).
  whois       TEXT,                         -- WHO  is affected / involved
  "when"      TEXT,                         -- WHEN it happens
  whereis     TEXT,                         -- WHERE it happens
  why         TEXT,                         -- WHY it matters / reason
  how         TEXT                          -- HOW it will proceed / what to do
);

-- Idempotent upgrade for databases created before the 5W1H fields existed.
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS whois   TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS "when"  TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS whereis TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS why     TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS how     TEXT;
-- Body is no longer mandatory — only WHAT (the title) must be filled in.
ALTER TABLE public.announcements ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.announcements ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcements publicly readable" ON public.announcements;
CREATE POLICY "Announcements publicly readable"
  ON public.announcements FOR SELECT USING (true);  -- shown on the public board ticker

DROP POLICY IF EXISTS "Admins manage announcements" ON public.announcements;
CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN'))
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN'));

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements (created_at DESC);

-- 2i) REALTIME — lets the public dashboard & task boards update live.
--     Wrapped so re-running the script never errors ("already member of publication").
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.task_categories; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- 3) AUTO-CREATE A PROFILE WHEN A USER REGISTERS
--    The FIRST user to register automatically becomes SUPER_ADMIN.
--    Every subsequent user gets the role sent by the client (default STANDARD).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_users BOOLEAN;
  v_role      TEXT;
BEGIN
  -- Is there already at least one profile in the system?
  SELECT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_has_users;

  IF NOT v_has_users THEN
    v_role := 'SUPER_ADMIN';           -- first registered user wins the crown
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'STANDARD');
  END IF;

  IF v_role NOT IN ('STANDARD', 'ADMIN', 'SUPER_ADMIN') THEN
    v_role := 'STANDARD';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, position, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'position',
    v_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: current user's role
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 4) RLS POLICIES — PROFILES
-- Profiles are readable by everyone so the Public Dashboard can show who is
-- assigned to each task (name/position only — no sensitive columns exist).
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles publicly readable" ON public.profiles;
CREATE POLICY "Profiles publicly readable"
  ON public.profiles FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- a regular user must never be able to escalate their own role
    AND role = public.get_current_role()
  );

DROP POLICY IF EXISTS "Super admins manage all profiles" ON public.profiles;
CREATE POLICY "Super admins manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.get_current_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_current_role() = 'SUPER_ADMIN');

-- 5) RLS POLICIES — TASKS
-- NOTE: tasks are readable by EVERYONE (anon included):
--   • the Public Viewing Dashboard at "/" has no login and must show real
--     counts on any device (previously it silently got 0 rows),
--   • multi-assignee users rely on task_assignments, not just assigned_to.
DROP POLICY IF EXISTS "Tasks viewable by assignee or admins" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are publicly readable" ON public.tasks;
-- Organization tasks are readable by everyone; PERSONAL tasks only by their
-- owner — never viewable or counted on the public board / dashboards.
CREATE POLICY "Tasks are publicly readable"
  ON public.tasks FOR SELECT
  TO public
  USING (NOT is_personal OR owner_id = auth.uid() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "Admins and above can insert tasks" ON public.tasks;
CREATE POLICY "Admins and above can insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN')
    -- Standard users may insert ONLY their own personal tasks.
    OR (is_personal AND owner_id = auth.uid() AND assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "Assignees can update own tasks" ON public.tasks;
CREATE POLICY "Assignees can update own tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() OR public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS "Admins and above can delete tasks" ON public.tasks;
CREATE POLICY "Admins and above can delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN'));

-- Owners may delete their own personal tasks (Standard users are not admins).
DROP POLICY IF EXISTS "Owners delete own personal tasks" ON public.tasks;
CREATE POLICY "Owners delete own personal tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (is_personal AND owner_id = auth.uid());

-- 6) WIPE ALL REGISTERED USERS (fresh start) — OPT-IN ONLY
-- ---------------------------------------------------------------------
-- ⚠ This DELETES every account and task. It is intentionally COMMENTED OUT
-- so re-running this migration script never destroys your data.
-- To start fresh, UNCOMMENT the three lines below and run them once, then
-- sign out of the app and register again — the FIRST user to register is
-- automatically assigned the SUPER_ADMIN role (see trigger in section 3).
--
-- DELETE FROM auth.users;         -- cascades to public.profiles and public.tasks
-- DELETE FROM public.profiles;    -- safety net for orphaned profile rows
-- DELETE FROM public.tasks;       -- safety net for orphaned task rows

-- 7) SECURITY DEFINER RPC: allow a SUPER_ADMIN to create new users from the app
--    (bypasses the need for service-role keys on the client).
--    Drop first so the parameter rename (p_office -> p_position) applies cleanly.
-- Drop every historical variant. Postgres identifies functions by argument
-- TYPES only, so we drop all 4/5-argument text variants that may exist.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_create_user'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_position TEXT,
  p_role TEXT DEFAULT 'STANDARD'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_user_id     UUID;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN can create users';
  END IF;

  IF p_role NOT IN ('STANDARD', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF length(coalesce(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    'production', v_user_id, 'authenticated', 'authenticated',
    lower(btrim(p_email)),
    public.crypt(p_password, public.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'position', p_position),
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.profiles (id, full_name, email, position, role)
  VALUES (v_user_id, p_full_name, lower(btrim(p_email)), p_position, p_role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        position  = EXCLUDED.position,
        role      = EXCLUDED.role;

  RETURN v_user_id;
END $$;

-- 7b) SECURITY DEFINER RPC: allow a SUPER_ADMIN to set (change/reset) another
--     user's password directly from User Management (key icon). The client
--     never touches auth.users — this function does, after verifying the
--     caller is a SUPER_ADMIN.
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_user_id UUID,
  p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN can change user passwords';
  END IF;

  IF length(coalesce(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE auth.users
     SET encrypted_password = public.crypt(p_password, public.gen_salt('bf')),
         updated_at = NOW()
   WHERE id = p_user_id;
END $$;

-- 8) PROFILE PICTURES — Supabase Storage ("avatars" bucket)
-- ---------------------------------------------------------------------
-- Every user can add/edit their own profile picture. The client compresses
-- the image (resize ≤512px + JPEG re-encode, see src/lib/avatar.ts) before
-- uploading to {user_id}/avatar.{ext}, then stores the public URL in
-- profiles.avatar_url. Re-running this block is safe.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create the public "avatars" bucket if it does not exist yet.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Anyone may view avatars (they are shown on public dashboards & task cards).
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Authenticated users may upload into their OWN folder only.
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Update = delete + re-insert (upsert), so both must be allowed for the owner.
DROP POLICY IF EXISTS "Users replace own avatar" ON storage.objects;
CREATE POLICY "Users replace own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
