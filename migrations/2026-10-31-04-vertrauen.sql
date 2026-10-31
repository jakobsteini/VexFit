-- ============================================================================
-- Vexfit - Vertrauen und mehr Anfragen (Baustein 4)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-03.
--
-- WAS DIESE DATEI TUT:
--   trainers.verifiziert             boolean  - "Verifiziert"-Abzeichen; NUR der
--       Admin setzt es (ueber die Edge Function, service_role). Kein Schreibrecht
--       fuer authenticated - sonst koennte sich jeder selbst verifizieren.
--   trainers.probetraining           boolean  - bietet der Trainer ein Probetraining?
--   trainers.probetraining_kostenlos boolean  - ist es kostenlos?
--       (beide vom Trainer in seinem Profil setzbar.)
--   trainers.antwort_stunden         integer  - Schnitt der Antwortzeit in Stunden
--   trainers.antwort_basis           integer  - Zahl der beantworteten Anfragen
--       (beide NUR von der Funktion antwortzeit_aktualisieren gesetzt, aus echten
--       Daten - nicht faelschbar.)
--   anfragen.beantwortet_am          timestamptz - wann der Trainer geantwortet hat.
--       Wird von einem Trigger gesetzt (nicht vom Client), sobald der Status auf
--       'angenommen' oder 'abgelehnt' wechselt - damit die Antwortzeit echt ist.
--
-- "Neu auf Vexfit" (erste 30 Tage) braucht KEINE Spalte: es wird aus
-- trainers.created_at berechnet (in der Sicht mit ausgegeben).
--
-- RUECKNAHME: 2026-10-31-04-vertrauen-ruecknahme.sql entfernt alles und setzt
-- die Sicht auf den Stand von 2026-10-31-03 zurueck.
-- ============================================================================

-- ------------------------------- Spalten ------------------------------------
ALTER TABLE public.trainers ADD COLUMN verifiziert             boolean NOT NULL DEFAULT false;
ALTER TABLE public.trainers ADD COLUMN probetraining           boolean NOT NULL DEFAULT false;
ALTER TABLE public.trainers ADD COLUMN probetraining_kostenlos boolean NOT NULL DEFAULT false;
ALTER TABLE public.trainers ADD COLUMN antwort_stunden         integer;
ALTER TABLE public.trainers ADD COLUMN antwort_basis           integer NOT NULL DEFAULT 0;

ALTER TABLE public.anfragen ADD COLUMN beantwortet_am timestamptz;
-- B4e: vermerkt, dass fuer diese Anfrage bereits zwei Alternativen verschickt
-- wurden (nur service_role / die Edge Function setzt es - kein Client-Recht).
ALTER TABLE public.anfragen ADD COLUMN alternativen_gesendet boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trainers.verifiziert IS 'Verifiziert-Abzeichen. Nur service_role (Admin ueber die Edge Function) setzt es.';
COMMENT ON COLUMN public.trainers.antwort_stunden IS 'Schnittliche Antwortzeit in Stunden. Nur antwortzeit_aktualisieren() setzt sie, aus echten beantwortet_am-Zeiten.';

-- ------------------------------- Rechte -------------------------------------
-- Der Trainer darf nur das Probetraining-Angebot der eigenen Zeile setzen.
-- verifiziert, antwort_stunden, antwort_basis bleiben fuer authenticated gesperrt.
GRANT UPDATE (probetraining, probetraining_kostenlos) ON public.trainers TO authenticated;

-- ----------------------- Antwortzeit: Trigger -------------------------------
-- Setzt beantwortet_am genau einmal, sobald der Status auf angenommen/abgelehnt
-- geht und noch kein Zeitpunkt steht. Laeuft unabhaengig von den Spaltenrechten,
-- deshalb kann der Client den Zeitpunkt nicht faelschen.
CREATE OR REPLACE FUNCTION public.anfrage_beantwortet_stempeln()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('angenommen', 'abgelehnt') AND NEW.beantwortet_am IS NULL THEN
    NEW.beantwortet_am := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anfrage_beantwortet_stempeln_trg ON public.anfragen;
CREATE TRIGGER anfrage_beantwortet_stempeln_trg
  BEFORE UPDATE ON public.anfragen
  FOR EACH ROW EXECUTE FUNCTION public.anfrage_beantwortet_stempeln();

-- ----------------------- Antwortzeit: Neuberechnung -------------------------
-- Berechnet die Antwortzeit des angemeldeten Trainers aus seinen echten Anfragen
-- (beantwortet_am - created_at) und speichert Schnitt (Stunden) und Basiszahl.
-- Der Trainer ruft sie nach dem Beantworten; die Werte kommen aus der Datenbank,
-- nicht vom Client - also nicht faelschbar.
CREATE OR REPLACE FUNCTION public.antwortzeit_aktualisieren()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer uuid;
  v_schnitt numeric;
  v_anzahl  integer;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF v_trainer IS NULL THEN RETURN; END IF;

  SELECT avg(extract(epoch FROM (beantwortet_am - created_at)) / 3600.0), count(*)
    INTO v_schnitt, v_anzahl
    FROM public.anfragen
   WHERE trainer_id = v_trainer AND beantwortet_am IS NOT NULL;

  UPDATE public.trainers
     SET antwort_basis   = COALESCE(v_anzahl, 0),
         antwort_stunden = CASE WHEN v_anzahl >= 1 THEN GREATEST(1, round(v_schnitt)::int) ELSE NULL END
   WHERE id = v_trainer;
END;
$$;

REVOKE ALL ON FUNCTION public.antwortzeit_aktualisieren() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.antwortzeit_aktualisieren() TO authenticated;

-- --------------------- Oeffentliche Sicht erweitern -------------------------
-- Zusaetzlich: verifiziert, probetraining(_kostenlos), antwort_stunden,
-- antwort_basis und created_at (fuer das "Neu"-Abzeichen).
CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie,
    verifiziert, probetraining, probetraining_kostenlos,
    antwort_stunden, antwort_basis, created_at
  FROM public.trainers
  WHERE aktiv = true
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;

GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;
