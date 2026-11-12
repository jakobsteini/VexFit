-- ============================================================================
-- Vexfit – Umkreis-Suche serverseitig dicht (Weg B mit Zwischenspeicher)
-- (Baustein 12.11.2026, Entscheidung Jakob). NUR Datei anlegen, NICHT einspielen.
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-12-01-suche-umkreis-ruecknahme.sql
--
-- Reihenfolge: nach allen bisherigen Migrationen (zuletzt 2026-11-10-01).
-- Mehrfach ausführbar (IF EXISTS / IF NOT EXISTS / DROP+CREATE POLICY).
--
-- Entscheidung Jakob 12.11.: anon sieht keine Trainerdaten; angemeldete Kunden
-- sehen nur Vor-Ort-Trainer im gleichen Land ≤ 25 km. Die Such-Mitte, die
-- Umkreisrechnung und die Filter laufen ab jetzt AUSSCHLIESSLICH serverseitig in
-- der Edge Function (vexfit-automation: /trainer-suche, /trainer-profil) mit dem
-- geheimen Schlüssel. Der Browser bekommt weder Koordinaten noch Umkreis in die
-- Hand und kann keine fremde Gegend mehr abfragen.
--
-- Darum entfallen die früheren RPCs suche_trainer_umkreis und trainer_profil
-- (sie nahmen Mittelpunkt und Umkreis vom Client entgegen). Die authenticated-
-- Leseregel auf trainers wird auf die EIGENE Zeile verengt – fremde Trainer
-- liefert nur noch die Edge Function.
-- ============================================================================

-- 1) Trainer-Koordinaten (aus der PLZ, serverseitig über plzAufloesen gesetzt) --
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS lng double precision;
COMMENT ON COLUMN public.trainers.lat IS
  'Breitengrad der Trainer-PLZ (serverseitig über plzAufloesen/plz_orte gesetzt). NULL = Standort ohne Koordinaten → nicht in der Suche.';

-- 2) Letzte Such-Mitte je Kunde (für die Sichtprüfung in /trainer-profil) -------
--    /trainer-suche schreibt sie bei jeder Suche; /trainer-profil gibt ein
--    fremdes Profil nur frei, wenn der Trainer ≤ 25 km um diese Mitte liegt
--    ODER der Kunde bereits eine Anfrage an ihn hat. Keine genaue PLZ nötig,
--    nur die zuletzt gesuchten Koordinaten. Nur über den geheimen Schlüssel
--    beschrieben/gelesen (die Kundenzeile selbst liest der Kunde ohnehin).
ALTER TABLE public.kunden ADD COLUMN IF NOT EXISTS letzte_such_lat double precision;
ALTER TABLE public.kunden ADD COLUMN IF NOT EXISTS letzte_such_lng double precision;
ALTER TABLE public.kunden ADD COLUMN IF NOT EXISTS letzte_such_am  timestamptz;

-- 3) Zwischenspeicher PLZ → Ort/Koordinaten (Weg B) ----------------------------
--    Die Edge Function schlägt eine PLZ zuerst hier nach; fehlt sie, fragt sie
--    api.zippopotam.us und legt das Ergebnis hier ab. So fragt dieselbe PLZ den
--    fremden Dienst nur einmal. NUR der geheime Schlüssel (service_role) schreibt
--    und liest; anon und authenticated haben KEINEN Zugriff (RLS an, keine Policy
--    + Grants entzogen). service_role umgeht RLS.
CREATE TABLE IF NOT EXISTS public.plz_orte (
  land        text        NOT NULL,                  -- 'AT' | 'DE' | 'CH'
  plz         text        NOT NULL,
  ort         text,
  lat         double precision,
  lng         double precision,
  quelle      text,                                  -- z. B. 'zippopotam'
  abgerufen_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (land, plz)
);
COMMENT ON TABLE public.plz_orte IS
  'Zwischenspeicher PLZ→Ort/Koordinaten (Weg B, 12.11.2026). Nur service_role (Edge Function). Kein Personenbezug.';

ALTER TABLE public.plz_orte ENABLE ROW LEVEL SECURITY;
-- Keine Policy für anon/authenticated → RLS verweigert ihnen jeden Zugriff.
-- Zusätzlich die Tabellen-Grants entziehen (Gürtel und Hosenträger).
REVOKE ALL ON public.plz_orte FROM anon;
REVOKE ALL ON public.plz_orte FROM authenticated;

-- 4) anon verliert den Lesezugriff auf die Vorschau-Sichten --------------------
--    Nicht angemeldete Besucher sehen keine Trainerdaten mehr.
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

-- 5) authenticated liest in trainers nur noch die EIGENE Zeile ------------------
--    (Teil B – in diesem Baustein AKTIV, weil suche.html, profil.html UND
--    kunden-bereich.html jetzt über die Edge Function /trainer-suche bzw.
--    /trainer-profil laufen und trainers nicht mehr direkt lesen.)
--    Fremde Trainer gibt es für Kunden nur noch über die Edge Function
--    (service_role). Ein angemeldeter Trainer sieht weiterhin seine eigene Zeile
--    (Trainerbereich, Profil-Bearbeiten, Rollen-Prüfung beim Login).
DROP POLICY IF EXISTS "trainers_angemeldet_lesen" ON public.trainers;
CREATE POLICY "trainers_angemeldet_lesen"
  ON public.trainers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 6) Die früheren Client-Koordinaten-RPCs entfernen ----------------------------
--    Sie nahmen Mittelpunkt (p_lat/p_lng) und Umkreis vom Browser entgegen und
--    sind durch die serverseitigen Endpunkte ersetzt. Die Rücknahme stellt sie
--    wieder her.
DROP FUNCTION IF EXISTS public.suche_trainer_umkreis(double precision, double precision, text, text, double precision);
DROP FUNCTION IF EXISTS public.trainer_profil(uuid);
