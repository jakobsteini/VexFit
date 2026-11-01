-- ============================================================================
-- Rücknahme zu 2026-11-01-01-gesamtpruefung.sql
--
-- Entfernt NUR, was die Migration angelegt hat: die Spalte
-- trainers.freigabe_mail_gesendet. Mehrfach ausführbar.
-- ============================================================================

ALTER TABLE public.trainers DROP COLUMN IF EXISTS freigabe_mail_gesendet;
