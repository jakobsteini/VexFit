-- ============================================================================
-- Rücknahme zu 2026-10-31-09-admin-sperren-protokoll.sql
--
-- Entfernt NUR das, was die Migration neu angelegt hat: die Protokolltabelle,
-- die Spalte gesperrt und den gesperrt-Filter der öffentlichen Sicht. Die
-- Admin-Lesepolicies werden NICHT entfernt – sie sind idempotente Fassungen
-- bereits bestehender Regeln (aus 2026-09-20/-10-14/-10-18/-10-24); ein Löschen
-- würde dem Admin das Lesen nehmen. Einzig die neu benannte warteliste-Regel
-- wird zurückgenommen.
-- ============================================================================

-- Öffentliche Sicht wieder ohne gesperrt-Filter (Stand nach 2026-10-31-05).
CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie,
    verifiziert, probetraining, probetraining_kostenlos,
    antwort_stunden, antwort_basis, created_at,
    verfuegbarkeit
  FROM public.trainers
  WHERE aktiv = true
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

DROP POLICY IF EXISTS "warteliste_admin_lesen" ON public.warteliste;

DROP POLICY IF EXISTS "admin_protokoll_admin_lesen" ON public.admin_protokoll;
DROP TABLE IF EXISTS public.admin_protokoll;

ALTER TABLE public.trainers DROP COLUMN IF EXISTS gesperrt;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS gesperrt;
