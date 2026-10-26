-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-26-03-stripe-abo.sql
-- Erzeugt am 26.10.2026. NICHT eingespielt.
-- Entfernt die beiden Abo-Felder wieder.
-- ============================================================================

ALTER TABLE public.trainers DROP COLUMN IF EXISTS abo_aktiv_bis;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS stripe_customer_id;
