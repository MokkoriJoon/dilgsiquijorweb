-- =====================================================================
-- Fix Super Admin "Add User" UUID error
-- ---------------------------------------------------------------------
-- Run once in Supabase → SQL Editor on an existing project.
-- Replaces only the existing RPC; does not change or delete user data.
-- =====================================================================

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
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
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
