-- ============================================================================
-- Vexfit – Admin-Bereich: Sperren, Protokoll, Admin-Lesepolicies
-- Erzeugt am 31.10.2026. NICHT eingespielt (nur Datei).
--
-- Bündelt alle DB-Änderungen, die der funktionsfähige Admin-Bereich braucht:
--   1. Spalte gesperrt auf trainers und kunden (für „Anmeldung sperren").
--   2. Tabelle admin_protokoll (Zeitpunkt/Admin/Aktion/Ziel), nur Admin liest;
--      geschrieben wird ausschließlich über die Edge Function (service_role).
--   3. Öffentliche Sicht trainers_oeffentlich: gesperrte Trainer verschwinden
--      zusätzlich aus der Suche (unverändert sonst).
--   4. Admin-Lesepolicies für kunden, anfragen, stripe_events_verarbeitet,
--      such_eingaben, warteliste, trainers – idempotent nachgezogen, damit der
--      Admin überall lesen kann, auch wenn eine ältere Migration nicht
--      eingespielt wurde. Die bestehenden Grundregeln für Trainer/Kunden
--      (Registrierung, eigene Zeile, öffentliche Sicht) werden NICHT verändert.
--
-- ist_vexfit_admin() stammt aus 2026-09-20-admin-vollzugriff.sql (dort definiert).
-- Alles ist mehrfach ausführbar (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, DROP POLICY IF EXISTS vor CREATE, to_regclass-Prüfung).
--
-- RÜCKNAHME: 2026-10-31-09-admin-sperren-protokoll-ruecknahme.sql.
-- ============================================================================

-- 1. Sperr-Spalte -----------------------------------------------------------
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS gesperrt boolean NOT NULL DEFAULT false;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS gesperrt boolean NOT NULL DEFAULT false;

-- 2. Protokolltabelle -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_protokoll (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zeitpunkt    timestamptz NOT NULL DEFAULT now(),
  admin_id     uuid,
  aktion       text NOT NULL,
  ziel_tabelle text,
  ziel_id      text
);
ALTER TABLE public.admin_protokoll ENABLE ROW LEVEL SECURITY;
-- Nur das Admin-Konto darf das Protokoll lesen. Geschrieben wird es allein von
-- der Edge Function mit service_role (umgeht RLS) – daher keine INSERT-Policy.
DROP POLICY IF EXISTS "admin_protokoll_admin_lesen" ON public.admin_protokoll;
CREATE POLICY "admin_protokoll_admin_lesen"
  ON public.admin_protokoll FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());
GRANT SELECT ON public.admin_protokoll TO authenticated;

-- 3. Öffentliche Sicht: gesperrte Trainer raus ------------------------------
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
    AND gesperrt IS NOT TRUE
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

-- 4. Admin-Lesepolicies (idempotent, nur wenn die Tabelle existiert) ---------
-- Nur-lesende Admin-Regeln; die bestehenden Grundregeln bleiben unberührt.
-- WICHTIG: Auf anfragen wird KEIN tabellenweites SELECT vergeben, damit der
-- Spalten-Entzug von kunden_email aus 2026-10-26-01 erhalten bleibt. Dort nur
-- die Zeilen-Policy (die Spaltenrechte aus 2026-10-26-01 regeln die Spalten).
DO $$
DECLARE
  z record;
BEGIN
  FOR z IN
    SELECT * FROM (VALUES
      ('trainers',                 'trainers_admin_alles_lesen',  true),
      ('kunden',                   'kunden_admin_alles_lesen',    true),
      ('anfragen',                 'anfragen_admin_alles_lesen',  false),
      ('stripe_events_verarbeitet','stripe_events_admin_lesen',   true),
      ('such_eingaben',            'such_eingaben_admin_lesen',    true),
      ('warteliste',               'warteliste_admin_lesen',       true)
    ) AS t(tab, pol, grant_select)
  LOOP
    IF to_regclass('public.' || z.tab) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', z.tab);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', z.pol, z.tab);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ist_vexfit_admin());',
        z.pol, z.tab);
      IF z.grant_select THEN
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', z.tab);
      END IF;
    END IF;
  END LOOP;
END $$;
