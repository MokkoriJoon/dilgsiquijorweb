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

-- 3) AUTO-CREATE A PROFILE WHEN A USER REGISTERS (default role: STANDARD)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, position, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'position',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'STANDARD')
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

-- 6) SEED: calibojunfranz@gmail.com → Junfranz Rock C. Calibo as SUPER_ADMIN
-- ---------------------------------------------------------------------
-- CASE A: the account ALREADY exists in Auth → promote it now.
UPDATE public.profiles
   SET full_name = 'Junfranz Rock C. Calibo',
       role      = 'SUPER_ADMIN',
       updated_at = NOW()
 WHERE email = 'calibojunfranz@gmail.com';

-- CASE B: the account does NOT exist yet → create it directly (dev bootstrap).
-- Initial password is "ChangeMe123!" — sign in and change it immediately.
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'calibojunfranz@gmail.com') THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      'production', v_user_id, 'authenticated', 'authenticated',
      'calibojunfranz@gmail.com',
      crypt('ChangeMe123!', gen_salt('bf')),
      NOW(), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Junfranz Rock C. Calibo"}',
      NOW(), NOW(),
      '', '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (v_user_id, 'Junfranz Rock C. Calibo', 'calibojunfranz@gmail.com', 'SUPER_ADMIN')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name, role = 'SUPER_ADMIN';

    RAISE NOTICE 'Seeded SUPER_ADMIN calibojunfranz@gmail.com with password ChangeMe123! — CHANGE IT IMMEDIATELY.';
  ELSE
    RAISE NOTICE 'User calibojunfranz@gmail.com already exists — promoted to SUPER_ADMIN via the UPDATE above.';
  END IF;
END $$;

-- 7) SECURITY DEFINER RPC: allow a SUPER_ADMIN to create new users from the app
--    (bypasses the need for service-role keys on the client).
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
