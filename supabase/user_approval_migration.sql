-- =====================================================================
-- User approval without email confirmation
-- ---------------------------------------------------------------------
-- Run once in Supabase → SQL Editor on an existing project.
-- Existing profiles remain approved. New public signups and Admin-created
-- accounts are pending until an approved SUPER_ADMIN approves them.
-- This does not delete users or change Supabase Auth email settings.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_users BOOLEAN;
  v_role TEXT;
  v_is_approved BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_has_users;
  IF NOT v_has_users THEN
    v_role := 'SUPER_ADMIN';
    v_is_approved := TRUE;
  ELSE
    v_role := 'STANDARD';
    v_is_approved := FALSE;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, position, role, is_approved)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'position',
    v_role,
    v_is_approved
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_approved()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_approved FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid() AND is_approved;
$$;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles publicly readable" ON public.profiles;
CREATE POLICY "Profiles publicly readable"
  ON public.profiles FOR SELECT TO public
  USING (
    is_approved
    OR id = auth.uid()
    OR public.get_current_role() = 'SUPER_ADMIN'
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.get_current_role()
    AND is_approved = TRUE
  );

DROP POLICY IF EXISTS "Super admins manage all profiles" ON public.profiles;
CREATE POLICY "Super admins manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.get_current_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_current_role() = 'SUPER_ADMIN');

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'tasks',
    'task_categories',
    'task_links',
    'task_assignments',
    'bookmarks',
    'site_settings',
    'announcements'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Approved accounts only" ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY "Approved accounts only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_user_approved()) WITH CHECK (public.is_user_approved())',
      v_table
    );
  END LOOP;
END $$;

-- Fix and secure the Admin account-creation RPC. Admin-created users are
-- Auth-confirmed without email, but start pending in the application.
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
  v_user_id UUID;
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
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
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    lower(btrim(p_email)),
    public.crypt(p_password, public.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'position', p_position),
    NOW(), NOW(), '', '', '', ''
  );

  UPDATE public.profiles
     SET full_name = p_full_name,
         email = lower(btrim(p_email)),
         position = p_position,
         role = p_role,
         is_approved = FALSE
   WHERE id = v_user_id;

  RETURN v_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_user_id UUID,
  p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
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

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN can delete users';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF v_target_role IS NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target_role = 'STANDARD' THEN
    DELETE FROM public.tasks WHERE is_personal AND owner_id = p_user_id;
    DELETE FROM public.task_categories WHERE is_personal AND owner_id = p_user_id;
    DELETE FROM public.bookmarks WHERE user_id = p_user_id;
  END IF;

  BEGIN
    DELETE FROM storage.objects
      WHERE bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = p_user_id::text;
  EXCEPTION WHEN others THEN NULL;
  END;

  DELETE FROM auth.users WHERE id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
END $$;

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_user_approved()
  );

DROP POLICY IF EXISTS "Users replace own avatar" ON storage.objects;
CREATE POLICY "Users replace own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_user_approved()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_user_approved()
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_user_approved()
  );
