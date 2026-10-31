-- ============================================================================
-- RUECKNAHME zu 2026-10-31-01-studios.sql
-- Entfernt genau das, was die Migration anlegt, und nichts sonst.
-- Reihenfolge rueckwaerts: zuerst die Funktionen und Spalten (haengen an den
-- Tabellen), dann die Tabellen. Der Seed verschwindet mit den Tabellen.
-- ============================================================================

DROP FUNCTION IF EXISTS public.studio_uebersicht(text);
DROP FUNCTION IF EXISTS public.studio_anzeigen(text, text);
DROP FUNCTION IF EXISTS public.studio_einladung_einloesen(text);

ALTER TABLE public.anfragen DROP COLUMN IF EXISTS studio_mitglied;
ALTER TABLE public.anfragen DROP COLUMN IF EXISTS studio_standort_id;

ALTER TABLE public.trainers DROP COLUMN IF EXISTS studio_standort_id;

DROP TABLE IF EXISTS public.studio_standorte;
DROP TABLE IF EXISTS public.studios;
