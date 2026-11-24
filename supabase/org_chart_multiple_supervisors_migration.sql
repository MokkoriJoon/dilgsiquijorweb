-- Additional matrix-reporting relationships in the organizational chart.
-- Safe to run more than once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.org_chart_supervisors (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, supervisor_id),
  CONSTRAINT org_chart_supervisors_no_self CHECK (profile_id <> supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_org_chart_supervisors_supervisor
  ON public.org_chart_supervisors (supervisor_id);

ALTER TABLE public.org_chart_supervisors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.org_chart_supervisors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_chart_supervisors TO authenticated;

DROP POLICY IF EXISTS "Organization chart supervisors publicly readable"
  ON public.org_chart_supervisors;
CREATE POLICY "Organization chart supervisors publicly readable"
  ON public.org_chart_supervisors FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Super admins manage organization chart supervisors"
  ON public.org_chart_supervisors;
CREATE POLICY "Super admins manage organization chart supervisors"
  ON public.org_chart_supervisors FOR ALL TO authenticated
  USING (public.get_current_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_current_role() = 'SUPER_ADMIN');

CREATE OR REPLACE FUNCTION public.save_org_chart_settings(
  p_profile_id UUID,
  p_manager_id UUID,
  p_chart_label TEXT,
  p_children_layout TEXT,
  p_report_groups JSONB,
  p_additional_supervisor_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_has_cycle BOOLEAN;
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only Super Admins can update organizational chart settings.';
  END IF;
  IF p_children_layout IS NULL OR p_children_layout NOT IN ('horizontal', 'vertical') THEN
    RAISE EXCEPTION 'Invalid direct-report layout.';
  END IF;
  IF p_profile_id = p_manager_id
     OR p_profile_id = ANY(COALESCE(p_additional_supervisor_ids, ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'A person cannot supervise themselves.';
  END IF;

  WITH RECURSIVE reporting_edges(supervisor_id, profile_id) AS (
    SELECT manager_id, profile_id
    FROM public.org_chart_positions
    WHERE manager_id IS NOT NULL
    UNION
    SELECT supervisor_id, profile_id
    FROM public.org_chart_supervisors
  ),
  descendants(profile_id) AS (
    SELECT profile_id
    FROM reporting_edges
    WHERE supervisor_id = p_profile_id
    UNION
    SELECT edge.profile_id
    FROM reporting_edges edge
    JOIN descendants parent ON edge.supervisor_id = parent.profile_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM descendants
    WHERE profile_id = p_manager_id
       OR profile_id = ANY(COALESCE(p_additional_supervisor_ids, ARRAY[]::UUID[]))
  ) INTO v_has_cycle;

  IF v_has_cycle THEN
    RAISE EXCEPTION 'A person cannot report to someone already below them in the chart.';
  END IF;

  INSERT INTO public.org_chart_positions (
    profile_id, manager_id, chart_label, children_layout, report_groups, updated_at
  )
  VALUES (
    p_profile_id, p_manager_id, p_chart_label, p_children_layout,
    COALESCE(p_report_groups, '[]'::JSONB), NOW()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    manager_id = EXCLUDED.manager_id,
    chart_label = EXCLUDED.chart_label,
    children_layout = EXCLUDED.children_layout,
    report_groups = EXCLUDED.report_groups,
    updated_at = NOW();

  DELETE FROM public.org_chart_supervisors
  WHERE profile_id = p_profile_id;

  INSERT INTO public.org_chart_supervisors (profile_id, supervisor_id)
  SELECT p_profile_id, submitted.supervisor_id
  FROM unnest(COALESCE(p_additional_supervisor_ids, ARRAY[]::UUID[]))
    AS submitted(supervisor_id)
  WHERE submitted.supervisor_id IS DISTINCT FROM p_manager_id
  ON CONFLICT (profile_id, supervisor_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_chart_settings(
  UUID, UUID, TEXT, TEXT, JSONB, UUID[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_org_chart_settings(
  UUID, UUID, TEXT, TEXT, JSONB, UUID[]
) TO authenticated;

DROP POLICY IF EXISTS "Approved accounts only" ON public.org_chart_supervisors;
CREATE POLICY "Approved accounts only"
  ON public.org_chart_supervisors AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_user_approved())
  WITH CHECK (public.is_user_approved());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_supervisors;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
