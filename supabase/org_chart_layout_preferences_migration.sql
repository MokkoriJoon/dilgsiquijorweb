-- Custom chart badges and direct-report layout preferences.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE public.org_chart_positions
  ADD COLUMN IF NOT EXISTS chart_label TEXT,
  ADD COLUMN IF NOT EXISTS children_layout TEXT NOT NULL DEFAULT 'horizontal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_chart_positions_children_layout_check'
      AND conrelid = 'public.org_chart_positions'::regclass
  ) THEN
    ALTER TABLE public.org_chart_positions
      ADD CONSTRAINT org_chart_positions_children_layout_check
      CHECK (children_layout IN ('horizontal', 'vertical'));
  END IF;
END $$;
