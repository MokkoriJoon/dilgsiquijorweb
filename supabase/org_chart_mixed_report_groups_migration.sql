-- Mixed horizontal and vertical groups of direct reports.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE public.org_chart_positions
  ADD COLUMN IF NOT EXISTS report_groups JSONB NOT NULL DEFAULT '[]'::JSONB;
