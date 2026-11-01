-- ============================================================================
-- RÜCKNAHME zu 2026-11-01-02-admin-neu.sql (Admin-Dashboard neu, Teil 3).
-- Entfernt die Kick-Funktion wieder. Die Spalte admin_protokoll.ergebnis bleibt
-- erhalten (sie enthält ggf. bereits Protokolldaten und stört nicht); zum
-- vollständigen Entfernen die untenstehende Zeile einkommentieren.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_person_kicken(text, uuid);

-- ACHTUNG: entfernt Protokoll-Ergebnisse unwiderruflich – nur bei Bedarf:
-- ALTER TABLE public.admin_protokoll DROP COLUMN IF EXISTS ergebnis;
