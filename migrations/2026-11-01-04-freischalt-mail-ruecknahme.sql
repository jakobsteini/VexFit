-- ============================================================================
-- Rücknahme zu 2026-11-01-04-freischalt-mail.sql
--
-- Entfernt NUR, was die Migration angelegt hat: die Spalte
-- trainers.freischalt_mail_gesendet. Achtung: damit verschwindet auch der
-- Versand-Vermerk (inklusive der beiden Hand-Mails an Marco Blome und Sofi
-- Silva). Mehrfach ausführbar.
-- ============================================================================

ALTER TABLE public.trainers DROP COLUMN IF EXISTS freischalt_mail_gesendet;
