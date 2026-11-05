-- ============================================================================
-- RÜCKNAHME zu migrations/2026-11-06-02-test-spam.sql (Vexfit B7, 06.11.2026)
-- Entfernt die Markierungsspalte ist_test wieder. Keine Daten gehen verloren,
-- außer der reinen Markierung (die Trainerzeilen selbst bleiben unberührt).
-- ============================================================================

DROP INDEX IF EXISTS public.trainers_ist_test_idx;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS ist_test;
