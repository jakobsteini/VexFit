-- ============================================================================
-- Vexfit – Sichtbarkeit: der Admin entscheidet allein
-- Erzeugt am 31.10.2026. NICHT eingespielt (nur Datei).
--
-- Entscheidung Jakob: Sichtbar in der Suche = aktiv = true UND nicht gesperrt.
-- Foto, Über mich und Spezialisierung sind KEINE Bedingung mehr.
--
-- Diese Migration reduziert die öffentliche Sicht trainers_oeffentlich auf
-- genau diese Bedingung. Alle Spalten und Rechte der View bleiben unverändert.
--
-- Abhängigkeit zu 2026-10-31-09 (Spalte gesperrt): nicht zwingend. Existiert die
-- Spalte gesperrt (09 eingespielt), lautet die Bedingung
--   aktiv = true AND gesperrt IS NOT TRUE
-- sonst nur
--   aktiv = true
-- Damit „nicht gesperrt" wirklich greift, sollte 09 vorher eingespielt sein;
-- ohne 09 sind nur noch aktiv=true-Trainer sichtbar (gesperrt gibt es dann
-- ohnehin nicht). Mehrfach ausführbar.
--
-- Die Spalten video_url/sprachen/trainingsorte/galerie/verifiziert/
-- probetraining/antwort_* stammen aus 2026-10-31-02/04/05 (heute eingespielt).
--
-- RÜCKNAHME: 2026-10-31-10-sichtbarkeit-admin-entscheidet-ruecknahme.sql
-- (stellt die alte Bedingung mit Foto/Bio/Spezialisierung wieder her).
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

  bedingung := CASE WHEN hat_gesperrt
    THEN 'aktiv = true AND gesperrt IS NOT TRUE'
    ELSE 'aktiv = true' END;

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
