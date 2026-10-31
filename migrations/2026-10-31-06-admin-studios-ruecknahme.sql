-- ============================================================================
-- RUECKNAHME zu 2026-10-31-06-admin-studios.sql
-- Entfernt die vier Admin-Funktionen.
-- ============================================================================

DROP FUNCTION IF EXISTS public.studio_admin_freigabe(uuid, boolean);
DROP FUNCTION IF EXISTS public.standort_admin_anlegen(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.studio_admin_anlegen(text, text);
DROP FUNCTION IF EXISTS public.studios_admin_liste();
