-- Focal person and handled programs on staff profiles.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_focal_person BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS programs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

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

  INSERT INTO public.profiles (
    id, full_name, email, position, role, is_approved, is_focal_person, programs
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'position',
    v_role,
    v_is_approved,
    COALESCE(NEW.raw_user_meta_data ->> 'is_focal_person', 'false') = 'true',
    CASE
      WHEN jsonb_typeof(NEW.raw_user_meta_data -> 'programs') = 'array'
           AND NEW.raw_user_meta_data ->> 'is_focal_person' = 'true'
        THEN ARRAY(
          SELECT btrim(program)
          FROM jsonb_array_elements_text(NEW.raw_user_meta_data -> 'programs') AS submitted(program)
          WHERE btrim(program) <> ''
        )
      ELSE ARRAY[]::TEXT[]
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
