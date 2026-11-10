-- =====================================================================
-- Independent completion state for each recurring task occurrence.
-- Run once in Supabase → SQL Editor on an existing project.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.task_occurrence_completions (
  task_id         UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  completion_note TEXT,
  completed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, occurrence_date, user_id)
);
GRANT SELECT ON public.task_occurrence_completions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.task_occurrence_completions TO authenticated;

ALTER TABLE public.task_occurrence_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Occurrence completions publicly readable" ON public.task_occurrence_completions;
CREATE POLICY "Occurrence completions publicly readable"
  ON public.task_occurrence_completions FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Assigned users update occurrence completions" ON public.task_occurrence_completions;
CREATE POLICY "Assigned users update occurrence completions"
  ON public.task_occurrence_completions FOR ALL TO authenticated
  USING (
    public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN')
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.task_assignments a
        WHERE a.task_id = task_occurrence_completions.task_id
          AND a.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMIN', 'SUPER_ADMIN')
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.task_assignments a
        WHERE a.task_id = task_occurrence_completions.task_id
          AND a.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Approved accounts only" ON public.task_occurrence_completions;
CREATE POLICY "Approved accounts only"
  ON public.task_occurrence_completions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_user_approved())
  WITH CHECK (public.is_user_approved());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.task_occurrence_completions;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
