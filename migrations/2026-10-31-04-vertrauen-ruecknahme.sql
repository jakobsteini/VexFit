-- ============================================================================
-- RUECKNAHME zu 2026-10-31-04-vertrauen.sql
-- Entfernt Spalten, Trigger, Funktionen und setzt die Sicht auf den Stand von
-- 2026-10-31-03 zurueck.
-- ============================================================================

DROP TRIGGER IF EXISTS anfrage_beantwortet_stempeln_trg ON public.anfragen;
DROP FUNCTION IF EXISTS public.anfrage_beantwortet_stempeln();
DROP FUNCTION IF EXISTS public.antwortzeit_aktualisieren();

-- Sicht auf den Stand von 2026-10-31-03 (mit Mindeststaerke, ohne Vertrauensfelder).
CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie
  FROM public.trainers
  WHERE aktiv = true
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

ALTER TABLE public.anfragen DROP COLUMN IF EXISTS alternativen_gesendet;
ALTER TABLE public.anfragen DROP COLUMN IF EXISTS beantwortet_am;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS antwort_basis;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS antwort_stunden;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS probetraining_kostenlos;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS probetraining;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS verifiziert;
