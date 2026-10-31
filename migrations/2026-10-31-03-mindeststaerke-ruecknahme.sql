-- ============================================================================
-- RUECKNAHME zu 2026-10-31-03-mindeststaerke.sql
-- Setzt die oeffentliche Sicht auf den Stand von 2026-10-31-02 zurueck
-- (nur aktiv = true, keine Mindeststaerke).
-- ============================================================================

CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie
  FROM public.trainers
  WHERE aktiv = true;

GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;
