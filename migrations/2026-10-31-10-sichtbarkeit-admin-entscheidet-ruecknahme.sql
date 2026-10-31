-- ============================================================================
-- Rücknahme zu 2026-10-31-10-sichtbarkeit-admin-entscheidet.sql
--
-- Stellt die vorherige Bedingung der öffentlichen Sicht wieder her:
--   aktiv = true [AND gesperrt IS NOT TRUE, falls die Spalte existiert]
--   AND avatar_url gesetzt AND bio nicht leer AND >= 1 Spezialisierung.
-- Entspricht dem Stand nach 2026-10-31-09 bzw. -05 (je nachdem, was eingespielt
-- ist). Spalten und Rechte unverändert.
-- ============================================================================

DO $$
DECLARE
  hat_gesperrt boolean;
  bedingung text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainers' AND column_name = 'gesperrt'
  ) INTO hat_gesperrt;

  bedingung :=
    (CASE WHEN hat_gesperrt THEN 'aktiv = true AND gesperrt IS NOT TRUE' ELSE 'aktiv = true' END)
    || ' AND avatar_url IS NOT NULL'
    || ' AND bio IS NOT NULL AND length(btrim(bio)) > 0'
    || ' AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1';

  EXECUTE format($v$
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
      WHERE %s
  $v$, bedingung);
END $$;

GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;
