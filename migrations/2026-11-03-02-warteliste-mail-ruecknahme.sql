-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-02-warteliste-mail.sql
-- Entfernt Token-Spalte und Indizes wieder von public.trainer_alerts.
-- Mehrfach ausführbar.
-- ============================================================================

DROP INDEX IF EXISTS public.trainer_alerts_offen_plz_idx;
DROP INDEX IF EXISTS public.trainer_alerts_abmelde_token_idx;
ALTER TABLE public.trainer_alerts DROP COLUMN IF EXISTS abmelde_token;
