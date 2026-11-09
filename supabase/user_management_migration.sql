-- =====================================================================
-- User Management auth fixes
-- ---------------------------------------------------------------------
-- Run once in Supabase → SQL Editor for projects that already ran schema.sql.
-- Safe to re-run. Does not alter existing users or email addresses.
-- =====================================================================

-- New public registrations must never choose their own role through user
-- metadata. A Super Admin can elevate accounts from User Management.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_users BOOLEAN;
  v_role      TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_has_users;
  IF NOT v_has_users THEN
    v_role := 'SUPER_ADMIN';
  ELSE
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

-- The legacy RPC inserted auth.users rows directly and marked them confirmed,
-- bypassing Supabase Auth's confirmation-email flow. New accounts are created
-- with auth.signUp from the app instead.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_create_user'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- Keep public profile email in sync only after Supabase Auth commits a
-- verified email change.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
       SET email = lower(NEW.email),
           updated_at = NOW()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();
