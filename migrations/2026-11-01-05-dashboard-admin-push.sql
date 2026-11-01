-- /Users/js/Projekte/Vexfit/app/vexfit/migrations/2026-11-01-05-dashboard-admin-push.sql
--
-- Baustein "Trainer-Dashboard + Admin am Handy + Push + Mails" (2026-11-01).
-- EINE Migration fuer alles Datenbanknoetige der Teile D (Trainer-Dashboard) und
-- A (Admin-PWA + Web Push):
--
--   D7  public.profilaufrufe          — anonyme Tageszaehlung der Profilaufrufe
--       public.profilaufruf_zaehlen() — +1 je Aufruf (ohne IP/Nutzer/Cookie)
--       public.profilaufrufe_30tage() — Summe der letzten 30 Tage (nur eigener)
--   D8  public.nachfrage_region()     — Anzahl Suchen der letzten 30 Tage in der
--                                       Region der Trainer-PLZ (nur eigene PLZ)
--   A3  public.push_abos             — Web-Push-Abos (nur Admin ueber Edge)
--
-- GRUNDSAETZE
--   * Idempotent: mehrfaches Einspielen aendert nichts (IF NOT EXISTS / OR REPLACE).
--   * RLS ist auf jeder neuen Tabelle an. Die Zaehl-/Lesefunktionen sind
--     SECURITY DEFINER und geben NUR Zahlen zurueck, nie Zeilen.
--   * NIE einspielen aus dem Code heraus. Diese Datei wird von Jakob im
--     SQL-Editor ausgefuehrt. Alle Seiten und die Edge Function laufen auch OHNE
--     eingespielte Migration fehlerfrei (Werte „–", Zaehlung/Push uebersprungen).
--   * Die Hilfsfunktion public.ist_vexfit_admin() stammt aus
--     2026-09-20-admin-vollzugriff.sql und wird hier NUR verwendet.
--
-- Ruecknahme: 2026-11-01-05-dashboard-admin-push-ruecknahme.sql

-- ════════════════════════════════════════════════════════════════════════════
-- D7 — PROFILAUFRUFE (anonyme Tageszaehlung)
-- ════════════════════════════════════════════════════════════════════════════
-- Bewusst NUR drei Spalten: Trainer, Tag, Anzahl. KEINE IP, KEIN User-Agent,
-- KEINE Nutzer-Kennung, keine weiteren Merkmale. Ein Aufruf erhoeht den Tages-
-- zaehler eines Trainers um eins; mehr wird nicht gespeichert.
CREATE TABLE IF NOT EXISTS public.profilaufrufe (
  trainer_id uuid        NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  tag        date        NOT NULL DEFAULT current_date,
  anzahl     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (trainer_id, tag)
);

COMMENT ON TABLE public.profilaufrufe IS
  'Anonyme Tageszaehlung der Profilaufrufe je Trainer. Keine IP, kein User-Agent, keine Nutzerkennung, keine Cookies - nur trainer_id, tag, anzahl.';

ALTER TABLE public.profilaufrufe ENABLE ROW LEVEL SECURITY;

-- Keine Standardrechte: anon/authenticated greifen NICHT direkt zu. Geschrieben
-- wird ausschliesslich ueber profilaufruf_zaehlen() (SECURITY DEFINER), gelesen
-- ueber profilaufrufe_30tage() bzw. direkt nur durch den Admin (Regel unten).
REVOKE ALL ON public.profilaufrufe FROM anon, authenticated;

-- Admin darf alles lesen (fuer eine spaetere Auswertung in der Verwaltung).
DROP POLICY IF EXISTS "profilaufrufe_admin_lesen" ON public.profilaufrufe;
CREATE POLICY "profilaufrufe_admin_lesen"
  ON public.profilaufrufe FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());

-- Obergrenze je Trainer und Tag: eine Plausibilitaetsgrenze, damit ein Skript
-- den Tageswert nicht ins Unermessliche treiben kann. Echte Aufrufe liegen
-- weit darunter.
CREATE OR REPLACE FUNCTION public.profilaufruf_zaehlen(p_trainer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grenze constant integer := 100000;  -- Plausibilitaetsgrenze pro Tag
  v_uid    uuid := auth.uid();
BEGIN
  -- Nur echte Trainer zaehlen (sonst nichts tun).
  IF NOT EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = p_trainer_id) THEN
    RETURN;
  END IF;

  -- Eigene Aufrufe des Trainers und Admin-Aufrufe zaehlen nicht. Anonyme
  -- Besucher (v_uid IS NULL) zaehlen. Bei einem angemeldeten Besucher wird
  -- geprueft, ob er dieser Trainer oder der Admin ist.
  IF v_uid IS NOT NULL THEN
    IF public.ist_vexfit_admin() THEN
      RETURN;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = p_trainer_id AND t.user_id = v_uid
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.profilaufrufe (trainer_id, tag, anzahl)
  VALUES (p_trainer_id, current_date, 1)
  ON CONFLICT (trainer_id, tag)
  DO UPDATE SET anzahl = LEAST(public.profilaufrufe.anzahl + 1, v_grenze);
END;
$$;

COMMENT ON FUNCTION public.profilaufruf_zaehlen(uuid) IS
  'Erhoeht den Tageszaehler der Profilaufrufe eines Trainers um eins. Speichert keine Kennzeichen. Eigene Aufrufe des Trainers und Admin-Aufrufe zaehlen nicht. Deckel pro Tag.';

-- Darf von jedem (auch anonym) aufgerufen werden - er gibt nichts zurueck und
-- schreibt nur den eigenen Tageszaehler eines echten Trainers hoch.
GRANT EXECUTE ON FUNCTION public.profilaufruf_zaehlen(uuid) TO anon, authenticated;

-- Summe der Profilaufrufe der letzten 30 Tage - NUR fuer den eingeloggten
-- Trainer und NUR dessen eigene Zahl. Gibt ausschliesslich eine Zahl zurueck.
CREATE OR REPLACE FUNCTION public.profilaufrufe_30tage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tid uuid;
  v_summe integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  SELECT t.id INTO v_tid FROM public.trainers t WHERE t.user_id = v_uid LIMIT 1;
  IF v_tid IS NULL THEN
    RETURN 0;
  END IF;
  SELECT COALESCE(SUM(p.anzahl), 0) INTO v_summe
  FROM public.profilaufrufe p
  WHERE p.trainer_id = v_tid
    AND p.tag >= current_date - 30;
  RETURN v_summe;
END;
$$;

COMMENT ON FUNCTION public.profilaufrufe_30tage() IS
  'Summe der eigenen Profilaufrufe der letzten 30 Tage fuer den eingeloggten Trainer. Gibt nur eine Zahl zurueck.';

GRANT EXECUTE ON FUNCTION public.profilaufrufe_30tage() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- D8 — NACHFRAGE IN DER REGION
-- ════════════════════════════════════════════════════════════════════════════
-- Anzahl der Suchen (such_eingaben) der letzten 30 Tage in der Region der
-- eigenen Trainer-PLZ. NUR fuer den eingeloggten Trainer, NUR dessen eigene PLZ,
-- Rueckgabe ausschliesslich eine Zahl.
--
-- Hinweis zur Region: In der Datenbank sind keine Koordinaten gespeichert (die
-- Umkreissuche in suche.html geocodiert im Browser ueber einen externen Dienst).
-- Ein echter Kilometer-Umkreis ist in reinem SQL daher nicht moeglich. Die
-- Region wird deshalb ueber die ersten zwei PLZ-Ziffern angenaehert (grobe
-- Leitregion). Ohne such_eingaben-Tabelle liefert der Aufruf 0.
CREATE OR REPLACE FUNCTION public.nachfrage_region()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_plz    text;
  v_praefix text;
  v_anzahl integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT t.plz INTO v_plz FROM public.trainers t WHERE t.user_id = v_uid LIMIT 1;
  -- Nur Ziffern; leere oder zu kurze PLZ: keine Region bestimmbar.
  v_plz := regexp_replace(COALESCE(v_plz, ''), '\D', '', 'g');
  IF length(v_plz) < 2 THEN
    RETURN NULL;
  END IF;
  v_praefix := left(v_plz, 2);

  SELECT count(*) INTO v_anzahl
  FROM public.such_eingaben s
  WHERE s.erstellt_am >= now() - interval '30 days'
    AND left(regexp_replace(COALESCE(s.plz, ''), '\D', '', 'g'), 2) = v_praefix;
  RETURN COALESCE(v_anzahl, 0);
EXCEPTION
  -- Fehlt die Tabelle such_eingaben (Migration nicht eingespielt), keine
  -- Nachfrage-Zahl statt eines Fehlers.
  WHEN undefined_table THEN RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.nachfrage_region() IS
  'Anzahl Suchen der letzten 30 Tage in der Region der eigenen Trainer-PLZ (erste zwei PLZ-Ziffern). Nur eingeloggter Trainer, nur eigene PLZ, nur eine Zahl.';

GRANT EXECUTE ON FUNCTION public.nachfrage_region() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- A3 — WEB-PUSH-ABOS
-- ════════════════════════════════════════════════════════════════════════════
-- Ein Abo je Gerät (Browser-Push-Endpunkt + die beiden Schlüssel). Gelesen und
-- geschrieben wird AUSSCHLIESSLICH über die abgesicherte Edge Function
-- (service_role, nach Login + zweitem Faktor). Deshalb bleibt die Tabelle für
-- anon/authenticated vollständig gesperrt (RLS an, keine Policy, alle Rechte
-- entzogen) – service_role umgeht RLS.
CREATE TABLE IF NOT EXISTS public.push_abos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  geraet      text,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_abos IS
  'Web-Push-Abos der Verwaltung (ein Gerät = eine Zeile: Endpoint + p256dh + auth). Nur über die Edge Function (service_role) les-/schreibbar; keine direkten Rechte für anon/authenticated.';

ALTER TABLE public.push_abos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_abos FROM anon, authenticated;
