-- =====================================================================
-- D.E.N.N.I.S — Roles, Profiles & Tasks schema (Supabase SQL)
-- Run this in the Supabase SQL Editor. It is idempotent and safe to re-run.
-- =====================================================================

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
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
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
DROP POLICY IF EXISTS "Tasks viewable by assignee or admins" ON public.tasks;
CREATE POLICY "Tasks viewable by assignee or admins"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR assigned_by = auth.uid()
    OR public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN')
  );

DROP POLICY IF EXISTS "Admins and above can insert tasks" ON public.tasks;
CREATE POLICY "Admins and above can insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN')
    OR assigned_to = auth.uid()
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

-- 6) WIPE ALL REGISTERED USERS (fresh start)
-- ---------------------------------------------------------------------
-- Deletes every account: auth users + profiles + tasks. The ON DELETE CASCADE
-- foreign keys take care of child rows automatically.
-- AFTER running this, sign out of the app and register again — the FIRST user
-- to register is automatically assigned the SUPER_ADMIN role (see trigger in
-- section 3). Do NOT re-run this script afterwards or you will erase your
-- new Super Admin account too.
DELETE FROM auth.users;   -- cascades to public.profiles and public.tasks
DELETE FROM public.profiles;  -- safety net for orphaned profile rows
DELETE FROM public.tasks;     -- safety net for orphaned task rows

-- 7) SECURITY DEFINER RPC: allow a SUPER_ADMIN to create new users from the app
--    (bypasses the need for service-role keys on the client).
--    Drop first so the parameter rename (p_office -> p_position) applies cleanly.
-- Drop BOTH the old (p_office) and new (p_position) variants. Postgres identifies
-- functions by argument TYPES only, so these two DROPs cover both signatures.
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text);
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
    crypt(p_password, gen_salt('bf')),
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
