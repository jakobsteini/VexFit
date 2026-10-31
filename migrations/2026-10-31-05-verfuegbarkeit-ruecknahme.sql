-- ============================================================================
-- RUECKNAHME zu 2026-10-31-05-verfuegbarkeit.sql
-- Setzt die Sicht auf den Stand von 2026-10-31-04 zurueck und entfernt die Spalte.
-- ============================================================================

CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie,
    verifiziert, probetraining, probetraining_kostenlos,
    antwort_stunden, antwort_basis, created_at
  FROM public.trainers
  WHERE aktiv = true
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

ALTER TABLE public.trainers DROP COLUMN IF EXISTS verfuegbarkeit;
