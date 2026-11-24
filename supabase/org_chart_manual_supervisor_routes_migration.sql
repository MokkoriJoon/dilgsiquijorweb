-- Add routing preferences and manual waypoints for matrix-reporting connectors.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE public.org_chart_supervisors
  ADD COLUMN IF NOT EXISTS connector_mode TEXT NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS manual_waypoints JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.org_chart_supervisors
  DROP CONSTRAINT IF EXISTS org_chart_supervisors_connector_mode_check;
ALTER TABLE public.org_chart_supervisors
  ADD CONSTRAINT org_chart_supervisors_connector_mode_check
  CHECK (connector_mode IN ('automatic', 'manual'));

DROP FUNCTION IF EXISTS public.save_org_chart_settings(
  UUID, UUID, TEXT, TEXT, JSONB, UUID[]
);

CREATE OR REPLACE FUNCTION public.save_org_chart_settings(
  p_profile_id UUID,
  p_manager_id UUID,
  p_chart_label TEXT,
  p_children_layout TEXT,
  p_report_groups JSONB,
  p_additional_supervisor_ids UUID[],
  p_connector_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_has_cycle BOOLEAN;
  v_supervisor_ids UUID[] := COALESCE(p_additional_supervisor_ids, ARRAY[]::UUID[]);
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only Super Admins can update organizational chart settings.';
  END IF;
  IF p_children_layout IS NULL OR p_children_layout NOT IN ('horizontal', 'vertical') THEN
    RAISE EXCEPTION 'Invalid direct-report layout.';
  END IF;
  IF p_connector_mode IS NULL OR p_connector_mode NOT IN ('automatic', 'manual') THEN
    RAISE EXCEPTION 'Invalid matrix connector mode.';
  END IF;
  IF p_profile_id = p_manager_id
     OR p_profile_id = ANY(v_supervisor_ids) THEN
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
       OR profile_id = ANY(v_supervisor_ids)
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
  WHERE profile_id = p_profile_id
    AND (
      supervisor_id = p_manager_id
      OR supervisor_id <> ALL(v_supervisor_ids)
    );

  INSERT INTO public.org_chart_supervisors (
    profile_id, supervisor_id, connector_mode
  )
  SELECT p_profile_id, submitted.supervisor_id, p_connector_mode
  FROM unnest(v_supervisor_ids) AS submitted(supervisor_id)
  WHERE submitted.supervisor_id IS DISTINCT FROM p_manager_id
  ON CONFLICT (profile_id, supervisor_id) DO UPDATE SET
    connector_mode = EXCLUDED.connector_mode;
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_chart_settings(
  UUID, UUID, TEXT, TEXT, JSONB, UUID[], TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_org_chart_settings(
  UUID, UUID, TEXT, TEXT, JSONB, UUID[], TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_org_chart_supervisor_route(
  p_profile_id UUID,
  p_supervisor_id UUID,
  p_manual_waypoints JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.get_current_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only Super Admins can update organizational chart routes.';
  END IF;
  IF p_manual_waypoints IS NULL
     OR jsonb_typeof(p_manual_waypoints) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Manual connector routes must be a JSON array.';
  END IF;
  IF jsonb_array_length(p_manual_waypoints) > 100 THEN
    RAISE EXCEPTION 'Manual connector routes must contain at most 100 waypoints.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_manual_waypoints) AS waypoint(value)
    WHERE jsonb_typeof(waypoint.value) IS DISTINCT FROM 'object'
       OR jsonb_typeof(waypoint.value -> 'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(waypoint.value -> 'y') IS DISTINCT FROM 'number'
       OR CASE
         WHEN jsonb_typeof(waypoint.value -> 'x') = 'number'
           THEN (waypoint.value ->> 'x')::NUMERIC < 0
             OR (waypoint.value ->> 'x')::NUMERIC > 200000
         ELSE FALSE
       END
       OR CASE
         WHEN jsonb_typeof(waypoint.value -> 'y') = 'number'
           THEN (waypoint.value ->> 'y')::NUMERIC < 0
             OR (waypoint.value ->> 'y')::NUMERIC > 200000
         ELSE FALSE
       END
  ) THEN
    RAISE EXCEPTION 'Manual connector waypoints must have valid non-negative x and y coordinates.';
  END IF;

  UPDATE public.org_chart_supervisors
  SET connector_mode = 'manual',
      manual_waypoints = p_manual_waypoints
  WHERE profile_id = p_profile_id
    AND supervisor_id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The additional supervisor relationship no longer exists.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_chart_supervisor_route(
  UUID, UUID, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_org_chart_supervisor_route(
  UUID, UUID, JSONB
) TO authenticated;
