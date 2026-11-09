-- ============================================================================
-- RUECKNAHME zu 2026-11-09-01-erinnerung-art.sql
-- Entfernt die Spalte "art" und ihren CHECK wieder. Die Tabelle
-- public.profil_erinnerungen bleibt bestehen (die legt 2026-11-08-04 an).
-- ============================================================================

ALTER TABLE public.profil_erinnerungen
  DROP CONSTRAINT IF EXISTS profil_erinnerungen_art_chk;
ALTER TABLE public.profil_erinnerungen
  DROP COLUMN IF EXISTS art;
