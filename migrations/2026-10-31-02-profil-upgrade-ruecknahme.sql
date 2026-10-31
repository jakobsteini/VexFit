-- ============================================================================
-- RUECKNAHME zu 2026-10-31-02-profil-upgrade.sql
-- Entfernt genau das, was die Migration anlegt. Die oeffentliche Sicht wird auf
-- den Stand von 2026-10-26-oeffentliche-trainer.sql zurueckgesetzt.
-- ============================================================================

-- Storage-Regeln.
DROP POLICY IF EXISTS "zertifikate_eigene_loeschen"          ON storage.objects;
DROP POLICY IF EXISTS "zertifikate_eigene_schreiben"         ON storage.objects;
DROP POLICY IF EXISTS "zertifikate_eigene_oder_admin_lesen"  ON storage.objects;
DROP POLICY IF EXISTS "galerie_eigene_loeschen"              ON storage.objects;
DROP POLICY IF EXISTS "galerie_eigene_aendern"               ON storage.objects;
DROP POLICY IF EXISTS "galerie_eigene_schreiben"             ON storage.objects;
DROP POLICY IF EXISTS "galerie_oeffentlich_lesen"            ON storage.objects;
-- Behaelter nur entfernen, wenn sie leer sind (sonst stehen lassen und von Hand
-- leeren). DELETE schlaegt bei belegten Behaeltern fehl - dann zuerst leeren.
DELETE FROM storage.buckets WHERE id = 'zertifikate';
DELETE FROM storage.buckets WHERE id = 'galerie';

-- Sicht auf den vorherigen Spaltenstand zuruecksetzen.
CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url
  FROM public.trainers
  WHERE aktiv = true;
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

-- Spalten entfernen.
ALTER TABLE public.trainers DROP COLUMN IF EXISTS zertifikat_datei;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS galerie;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS trainingsorte;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS sprachen;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS video_url;
