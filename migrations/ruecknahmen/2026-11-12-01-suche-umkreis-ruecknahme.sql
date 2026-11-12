-- Rücknahme zu 2026-11-12-01-suche-umkreis.sql.
-- Stellt den Stand vor dem Baustein wieder her.

DROP FUNCTION IF EXISTS public.suche_trainer_umkreis(double precision, double precision, text, text, double precision);
DROP FUNCTION IF EXISTS public.trainer_profil(uuid);

-- (Teil B / die authenticated-Policy wurde in diesem Baustein NICHT verschärft –
--  daher hier nichts zurückzunehmen. Falls Teil B später eingespielt wurde:
--  DROP POLICY "trainers_angemeldet_lesen"; CREATE ... USING (aktiv = true OR
--  user_id = auth.uid());)

-- anon-Lesezugriff wiederherstellen: trainers_vorschau view-weit (korrekt), und
-- für trainers_oeffentlich die Spalten-Allowlist aus 2026-11-08-03 (NICHT
-- view-weit, sonst läge nachname wieder frei). Am saubersten anschließend
-- 2026-11-08-03-anon-kein-nachname.sql erneut einspielen.
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

-- Koordinatenspalten entfernen.
ALTER TABLE public.trainers DROP COLUMN IF EXISTS lat;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS lng;
