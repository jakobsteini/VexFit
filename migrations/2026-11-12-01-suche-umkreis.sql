-- ============================================================================
-- Vexfit – Suche nur für angemeldete Kunden, 25 km Umkreis, gleiches Land
-- (Baustein 12.11.2026). NUR Datei anlegen, NICHT einspielen.
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-12-01-suche-umkreis-ruecknahme.sql
--
-- Reihenfolge: nach allen bisherigen Migrationen (zuletzt 2026-11-10-01).
-- Mehrfach ausführbar.
--
-- Entscheidung Jakob 12.11.: anon sieht keine Trainerdaten; authenticated nur
-- Vor-Ort-Trainer im gleichen Land ≤ 25 km. Keine PLZ→Koordinaten-Tabelle in der
-- DB → die Such-Mitte kommt als Koordinaten vom angemeldeten Client (vexfit-plz.js);
-- Trainer-Koordinaten werden neu in trainers.lat/lng gespeichert.
-- ============================================================================

-- 1) Trainer-Koordinaten (aus der PLZ bei Registrierung/Profilpflege) ----------
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS lng double precision;
COMMENT ON COLUMN public.trainers.lat IS
  'Breitengrad der Trainer-PLZ (aus vexfit-plz.js/zippopotam). NULL = Standort ohne Koordinaten → nicht in der Suche.';

-- 2) anon verliert den Lesezugriff auf die Vorschau-Sichten --------------------
--    Nicht angemeldete Besucher sehen ab jetzt gar keine Trainerdaten mehr.
--    trainers_oeffentlich trägt für anon SPALTEN-Grants (2026-11-08-03); ein
--    view-weites REVOKE allein hebt die nicht auf → Spalten EINZELN entziehen.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trainers_oeffentlich';
  IF cols IS NOT NULL THEN
    EXECUTE format('REVOKE SELECT (%s) ON public.trainers_oeffentlich FROM anon', cols);
  END IF;
END $$;
REVOKE SELECT ON public.trainers_oeffentlich FROM anon;
REVOKE SELECT ON public.trainers_vorschau   FROM anon;

-- 3) authenticated: direkter Tabellenzugriff auf fremde Trainer ---------------
--    ⚠️ BLOCK / TEIL B – BEWUSST NICHT AKTIV (siehe Abschluss).
--    Dieser Schritt beschränkt den angemeldeten Lesezugriff auf die EIGENE Zeile;
--    fremde Trainer liefen dann nur noch über die RPCs. suche.html und profil.html
--    sind bereits umgebaut. ABER kunden-bereich.html liest die Trainertabelle noch
--    direkt (eigene Umkreis-Suche) – würde dieser Schritt jetzt laufen, bliebe die
--    Trainerliste im Kundenbereich leer. Deshalb ERST ausführen, nachdem
--    kunden-bereich.html auf suche_trainer_umkreis umgestellt ist.
--    Dann genau diese zwei Zeilen einspielen:
--
--    DROP POLICY IF EXISTS "trainers_angemeldet_lesen" ON public.trainers;
--    CREATE POLICY "trainers_angemeldet_lesen"
--      ON public.trainers FOR SELECT TO authenticated
--      USING (user_id = auth.uid());

-- 4) RPC: Umkreissuche (nur authenticated) ------------------------------------
--    Such-Mitte (p_lat/p_lng) kommt vom Client (vexfit-plz.js). Gibt nur die
--    bisher für angemeldete Kunden erlaubten Felder zurück (keine E-Mail/Telefon/
--    user_id). Gleiches Land, nur Vor-Ort, ≤ p_umkreis_km, mit Koordinaten.
CREATE OR REPLACE FUNCTION public.suche_trainer_umkreis(
  p_lat        double precision,
  p_lng        double precision,
  p_land       text,
  p_schwerpunkt text DEFAULT NULL,
  p_umkreis_km double precision DEFAULT 25
)
RETURNS TABLE (
  id uuid, created_at timestamptz, vorname text, nachname text, stadt text,
  plz text, land text, trainingsart text, trainingsort text, erfahrung text,
  spezialisierungen text[], sprachen text[], trainingsorte text[], bio text,
  preis_stunde numeric, preis_monat numeric, zertifikate text, calendly text,
  avatar_url text, verifiziert boolean, verfuegbarkeit text,
  entfernung_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.created_at, t.vorname, t.nachname, t.stadt, t.plz, t.land,
    t.trainingsart, t.trainingsort, t.erfahrung, t.spezialisierungen, t.sprachen,
    t.trainingsorte, t.bio, t.preis_stunde, t.preis_monat, t.zertifikate,
    t.calendly, t.avatar_url, t.verifiziert, t.verfuegbarkeit,
    (6371 * 2 * asin(sqrt(
      power(sin(radians(t.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(t.lat)) *
      power(sin(radians(t.lng - p_lng) / 2), 2)
    )))::double precision AS entfernung_km
  FROM public.trainers t
  WHERE t.aktiv = true
    AND t.gesperrt IS NOT TRUE
    AND t.ist_test IS NOT TRUE
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    AND p_lat IS NOT NULL AND p_lng IS NOT NULL
    -- gleiches Land (AT/DE/CH), gross/klein egal
    AND upper(btrim(COALESCE(t.land, ''))) = upper(btrim(COALESCE(p_land, '')))
    -- nur Vor-Ort-Trainer (online-only ausgeschlossen)
    AND COALESCE(t.trainingsort, '') IN ('vor_ort', 'beides')
    -- optionaler Schwerpunkt
    AND (
      p_schwerpunkt IS NULL OR btrim(p_schwerpunkt) = ''
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t.spezialisierungen, ARRAY[]::text[])) s
                 WHERE s ILIKE '%' || btrim(p_schwerpunkt) || '%')
      OR COALESCE(t.trainingsart, '') ILIKE '%' || btrim(p_schwerpunkt) || '%'
    )
    -- Umkreis (Haversine, km)
    AND (6371 * 2 * asin(sqrt(
      power(sin(radians(t.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(t.lat)) *
      power(sin(radians(t.lng - p_lng) / 2), 2)
    ))) <= COALESCE(p_umkreis_km, 25)
  ORDER BY entfernung_km ASC;
$$;

-- 5) RPC: einzelnes Profil (nur authenticated) --------------------------------
--    Für profil.html (angemeldeter Kunde). Keine Entfernungsprüfung, aber nur
--    freigegebene, nicht gesperrte, nicht-Test-Trainer; dieselben erlaubten Felder.
CREATE OR REPLACE FUNCTION public.trainer_profil(p_id uuid)
RETURNS TABLE (
  id uuid, created_at timestamptz, vorname text, nachname text, stadt text,
  plz text, land text, trainingsart text, trainingsort text, erfahrung text,
  spezialisierungen text[], sprachen text[], trainingsorte text[], bio text,
  preis_stunde numeric, preis_monat numeric, zertifikate text, calendly text,
  avatar_url text, verifiziert boolean, verfuegbarkeit text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.created_at, t.vorname, t.nachname, t.stadt, t.plz, t.land,
    t.trainingsart, t.trainingsort, t.erfahrung, t.spezialisierungen, t.sprachen,
    t.trainingsorte, t.bio, t.preis_stunde, t.preis_monat, t.zertifikate,
    t.calendly, t.avatar_url, t.verifiziert, t.verfuegbarkeit
  FROM public.trainers t
  WHERE t.id = p_id
    AND t.aktiv = true AND t.gesperrt IS NOT TRUE AND t.ist_test IS NOT TRUE
  LIMIT 1;
$$;

-- 6) Ausführungsrechte: nur authenticated, nie anon/public ---------------------
REVOKE ALL ON FUNCTION public.suche_trainer_umkreis(double precision, double precision, text, text, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trainer_profil(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suche_trainer_umkreis(double precision, double precision, text, text, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_profil(uuid) TO authenticated;
