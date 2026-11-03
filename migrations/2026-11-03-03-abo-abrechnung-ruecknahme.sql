-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-03-abo-abrechnung.sql
-- Entfernt Index und die drei Abo-Spalten wieder von public.trainers.
-- Mehrfach ausführbar.
-- ============================================================================

DROP INDEX IF EXISTS public.trainers_stripe_customer_id_idx;
ALTER TABLE public.trainers
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS abo_status,
  DROP COLUMN IF EXISTS abo_status_am;
