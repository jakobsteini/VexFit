-- ============================================================================
-- Vexfit - Grobe Verfuegbarkeit des Trainers (Baustein 6)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-04.
--
-- WAS DIESE DATEI TUT:
--   trainers.verfuegbarkeit text[] - grobe Zeiten als Liste von Kuerzeln aus
--     Wochentag + Tageszeit, z. B. 'mo_morgen', 'sa_abend'. Kein Buchungs-
--     kalender, nur ein grober Raster-Ueberblick. Wird im Profil angezeigt und
--     im Kunden-Matching (Baustein 5) genutzt.
--
-- RECHTE: der Trainer darf die eigene Zeile aendern (ergaenzt die eingegrenzte
-- UPDATE-Freigabe). Die oeffentliche Sicht gibt das Feld mit aus (unbedenklich).
--
-- RUECKNAHME: 2026-10-31-05-verfuegbarkeit-ruecknahme.sql entfernt alles und
-- setzt die Sicht auf den Stand von 2026-10-31-04 zurueck.
-- ============================================================================

ALTER TABLE public.trainers ADD COLUMN verfuegbarkeit text[];

COMMENT ON COLUMN public.trainers.verfuegbarkeit IS
  'Grobe Verfuegbarkeit: Liste aus <wochentag>_<tageszeit> (z. B. mo_morgen). Kein Kalender.';

GRANT UPDATE (verfuegbarkeit) ON public.trainers TO authenticated;

-- Sicht um verfuegbarkeit erweitern (Stand 2026-10-31-04 + verfuegbarkeit).
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
