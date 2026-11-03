-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-01-herkunft.sql
-- Entfernt die Spalte herkunft wieder von trainers und kunden.
-- Mehrfach ausführbar (DROP COLUMN IF EXISTS).
-- ============================================================================

ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft;
