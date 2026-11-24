-- Add line styles for independently drawn organization-chart connectors.
-- Run after the organizational-chart migration in Supabase SQL Editor.

ALTER TABLE public.org_chart_connectors
  ADD COLUMN IF NOT EXISTS line_style TEXT NOT NULL DEFAULT 'solid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'org_chart_connectors_line_style_check'
      AND conrelid = 'public.org_chart_connectors'::regclass
  ) THEN
    ALTER TABLE public.org_chart_connectors
      ADD CONSTRAINT org_chart_connectors_line_style_check
      CHECK (line_style IN ('solid', 'dashed'));
  END IF;
END $$;
