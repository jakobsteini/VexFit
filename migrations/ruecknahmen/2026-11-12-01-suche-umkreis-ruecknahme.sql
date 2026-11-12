-- Rücknahme zu 2026-11-12-01-suche-umkreis.sql (Weg B mit Zwischenspeicher).
-- Stellt den Stand vor dem Baustein wieder her.

-- 5) authenticated-Leseregel wieder weiten (freigeschaltete + eigene Zeile).
DROP POLICY IF EXISTS "trainers_angemeldet_lesen" ON public.trainers;
CREATE POLICY "trainers_angemeldet_lesen"
  ON public.trainers FOR SELECT TO authenticated
  USING (aktiv = true OR user_id = auth.uid());

-- 6) Die Client-Koordinaten-RPCs wiederherstellen (nur authenticated).
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
    AND upper(btrim(COALESCE(t.land, ''))) = upper(btrim(COALESCE(p_land, '')))
    AND COALESCE(t.trainingsort, '') IN ('vor_ort', 'beides')
    AND (
      p_schwerpunkt IS NULL OR btrim(p_schwerpunkt) = ''
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t.spezialisierungen, ARRAY[]::text[])) s
                 WHERE s ILIKE '%' || btrim(p_schwerpunkt) || '%')
      OR COALESCE(t.trainingsart, '') ILIKE '%' || btrim(p_schwerpunkt) || '%'
    )
    AND (6371 * 2 * asin(sqrt(
      power(sin(radians(t.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(t.lat)) *
      power(sin(radians(t.lng - p_lng) / 2), 2)
    ))) <= COALESCE(p_umkreis_km, 25)
  ORDER BY entfernung_km ASC;
$$;

CREATE OR REPLACE FUNCTION public.trainer_profil(p_id uuid)
RETURNS TABLE (
  id uuid, created_at timestamptz, vorname text, nachname text, stadt text,
  plz text, land text, trainingsart text, trainingsort text, erfahrung text,
  spezialisierungen text[], sprachen text[], trainingsorte text[], bio text,
  preis_stunde numeric, preis_monat numeric, zertifikate text, calendly text,
  avatar_url text, verifiziert boolean, verfuegbarkeit text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

REVOKE ALL ON FUNCTION public.suche_trainer_umkreis(double precision, double precision, text, text, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trainer_profil(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suche_trainer_umkreis(double precision, double precision, text, text, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_profil(uuid) TO authenticated;

-- 3) Zwischenspeicher entfernen.
DROP TABLE IF EXISTS public.plz_orte;

-- 2) Letzte Such-Mitte-Spalten entfernen.
ALTER TABLE public.kunden DROP COLUMN IF EXISTS letzte_such_lat;
ALTER TABLE public.kunden DROP COLUMN IF EXISTS letzte_such_lng;
ALTER TABLE public.kunden DROP COLUMN IF EXISTS letzte_such_am;

-- 4) anon-Lesezugriff auf die Vorschau-Sichten wiederherstellen. Für
--    trainers_oeffentlich die Spalten-Allowlist aus 2026-11-08-03 (NICHT
--    view-weit, sonst läge nachname wieder frei). Am saubersten anschließend
--    2026-11-08-03-anon-kein-nachname.sql erneut einspielen.
GRANT SELECT ON public.trainers_vorschau TO anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trainers_oeffentlich'
    AND column_name = ANY (ARRAY[
      'id','vorname','stadt','plz','land','trainingsart','trainingsort',
      'spezialisierungen','bio','preis_stunde','preis_monat','avatar_url',
      'video_url','sprachen','trainingsorte','galerie','verifiziert',
      'probetraining','probetraining_kostenlos','antwort_stunden','antwort_basis',
      'created_at','verfuegbarkeit']);
  IF cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.trainers_oeffentlich TO anon', cols);
  END IF;
END $$;

-- 1) Koordinatenspalten entfernen.
ALTER TABLE public.trainers DROP COLUMN IF EXISTS lat;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS lng;
