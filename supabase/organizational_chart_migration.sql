-- Organizational chart and public staff contact details.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

CREATE TABLE IF NOT EXISTS public.org_chart_positions (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  position_x DOUBLE PRECISION,
  position_y DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_chart_positions_no_self_manager CHECK (profile_id <> manager_id)
);
ALTER TABLE public.org_chart_positions
  ADD COLUMN IF NOT EXISTS position_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS position_y DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_org_chart_manager
  ON public.org_chart_positions (manager_id);

ALTER TABLE public.org_chart_positions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.org_chart_positions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_chart_positions TO authenticated;

DROP POLICY IF EXISTS "Organization chart publicly readable"
  ON public.org_chart_positions;
CREATE POLICY "Organization chart publicly readable"
  ON public.org_chart_positions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Super admins manage organization chart"
  ON public.org_chart_positions;
CREATE POLICY "Super admins manage organization chart"
  ON public.org_chart_positions FOR ALL TO authenticated
  USING (public.get_current_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_current_role() = 'SUPER_ADMIN');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_positions;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
