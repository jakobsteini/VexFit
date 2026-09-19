-- ============================================================================
-- Vexfit - Zugriffsregeln vollstaendig neu aufbauen
-- Erzeugt am 19.09.2026. NICHT eingespielt.
--
-- WARUM DIESE DATEI:
-- Der Zeilenschutz ist fuer alle sechs Tabellen eingeschaltet, aber darunter
-- liegen 17 alte Regeln, die fast alles fuer jeden erlauben. In Postgres
-- genuegt eine einzige erlaubende Regel: solange die alten bestehen, waere
-- der Entwurf vom 14.09.2026 wirkungslos. Deshalb wird hier zuerst geraeumt
-- und danach neu gesetzt - in einer Datei, in dieser Reihenfolge.
--
-- REIHENFOLGE: Zuerst 2026-09-17-anfragen-trainer-id.sql einspielen, falls das
-- noch nicht geschehen ist. Teil 3 setzt die Spalte anfragen.trainer_id voraus.
--
-- RUECKNAHME: 2026-09-19-zugriffsregeln-neuaufbau-ruecknahme.sql. Sie stellt
-- die alten unsicheren Regeln NICHT wieder her; danach liegen die Daten wieder
-- offen. Sie ist eine Notbremse, kein Dauerzustand.
--
-- Zwei Ebenen wirken zusammen:
--   Zeilen  -> Row Level Security mit Policies
--   Spalten -> GRANT, denn RLS kann keine einzelnen Spalten einschraenken
-- ============================================================================


-- ############################################################################
-- TEIL 1 - ALTE REGELN ENTFERNEN
-- ############################################################################
--
-- Dieser Block entfernt JEDE im Schema public vorhandene Regel, ohne dass ihr
-- Name bekannt sein muss: Postgres laeuft ueber pg_policies und loescht, was
-- es dort findet. Das ist noetig, weil in Postgres eine einzige erlaubende
-- Regel genuegt, um Daten offenzulegen - bliebe auch nur eine alte Regel
-- stehen, waeren Teil 2 und Teil 3 wirkungslos und die Daten weiter offen.
--
-- Der Block raeumt bewusst auch die Regeln mit weg, die Teil 3 gleich danach
-- neu setzt. Beim ersten Einspielen gibt es sie noch nicht, bei einem zweiten
-- Durchlauf schon - so bleibt die Datei wiederholbar.
--
-- ZUM ZEITPUNKT DER MESSUNG (19.09.2026) bestanden 17 Regeln, verteilt auf:
--   anfragen      2
--   bewertungen   2
--   favoriten     3
--   kunden        4
--   nachrichten   2
--   trainers      4
-- Das ist reine Dokumentation des Vorzustands. Der Block arbeitet unabhaengig
-- davon: er entfernt, was er vorfindet, auch wenn es inzwischen mehr oder
-- weniger Regeln sind.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname
             FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- ############################################################################
-- TEIL 2 - ZEILENSCHUTZ EINSCHALTEN
-- ############################################################################
-- Schadet nicht, wenn er schon an ist, und stellt sicher, dass keine Tabelle
-- ungeschuetzt bleibt.

ALTER TABLE public.trainers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kunden      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anfragen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nachrichten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoriten   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewertungen ENABLE ROW LEVEL SECURITY;


-- ############################################################################
-- TEIL 3 - NEUE REGELN SETZEN
-- ############################################################################

-- ============================ trainers ======================================

-- Nimmt dem nicht angemeldeten Besucher zunaechst jedes Recht an der Tabelle.
REVOKE ALL ON public.trainers FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher genau die Spalten, die Suche und
-- oeffentliches Profil anzeigen; E-Mail, Telefon, user_id, stripe_bezahlt,
-- preis_online und alert_sent sind bewusst nicht dabei.
GRANT SELECT (id, created_at, vorname, nachname, stadt, plz, trainingsart,
              erfahrung, spezialisierungen, bio, preis_stunde, preis_monat,
              zertifikate, calendly, avatar_url, aktiv)
  ON public.trainers TO anon;

-- Erlaubt dem nicht angemeldeten Besucher, bei der Registrierung ein
-- Trainerprofil anzulegen.
GRANT INSERT (vorname, nachname, email, telefon, stadt, plz, trainingsart,
              erfahrung, spezialisierungen, bio, preis_stunde, preis_monat,
              zertifikate, calendly, stripe_bezahlt, aktiv, user_id)
  ON public.trainers TO anon;

-- Gibt dem angemeldeten Nutzer Zugriff auf alle Spalten; welche Zeilen er
-- sieht und aendern darf, entscheiden die Regeln darunter. Kein DELETE.
GRANT SELECT, INSERT, UPDATE ON public.trainers TO authenticated;

-- Zeigt nicht angemeldeten Besuchern ausschliesslich freigeschaltete Trainer.
CREATE POLICY "trainers_oeffentlich_nur_aktive"
  ON public.trainers FOR SELECT TO anon
  USING (aktiv = true);

-- Zeigt angemeldeten Nutzern die freigeschalteten Trainer und zusaetzlich die
-- eigene Zeile, auch wenn diese noch nicht freigeschaltet ist.
CREATE POLICY "trainers_angemeldet_lesen"
  ON public.trainers FOR SELECT TO authenticated
  USING (aktiv = true OR user_id = auth.uid());

-- Laesst bei der Registrierung ein neues Trainerprofil zu, aber nur als noch
-- nicht freigeschaltet, damit sich niemand selbst sichtbar schalten kann.
CREATE POLICY "trainers_registrieren"
  ON public.trainers FOR INSERT TO anon, authenticated
  WITH CHECK (aktiv = false);

-- Erlaubt einem angemeldeten Trainer, ausschliesslich seine eigene Zeile zu
-- aendern.
CREATE POLICY "trainers_eigene_zeile_aendern"
  ON public.trainers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Kein DELETE: weder anon noch authenticated erhalten das Recht, und es gibt
-- keine Loeschregel. Damit kann ueber den oeffentlichen Schluessel niemand
-- einen Trainer entfernen.


-- ============================= kunden =======================================

-- Nimmt dem nicht angemeldeten Besucher jedes Leserecht an den Kundendaten.
REVOKE ALL ON public.kunden FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher ausschliesslich, sich bei der
-- Registrierung selbst einzutragen.
GRANT INSERT (vorname, nachname, email, stadt, plz, ziel, erwartungen, user_id)
  ON public.kunden TO anon;

-- Gibt dem angemeldeten Nutzer Zugriff auf alle Spalten; die Zeilen regeln die
-- Regeln darunter. Kein DELETE.
GRANT SELECT, INSERT, UPDATE ON public.kunden TO authenticated;

-- Laesst bei der Registrierung einen neuen Kundeneintrag zu.
CREATE POLICY "kunden_registrieren"
  ON public.kunden FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Zeigt einem angemeldeten Kunden nur seine eigene Zeile; der Abgleich laeuft
-- ueber user_id und zusaetzlich ueber die E-Mail, weil ein Altbestand ohne
-- user_id existiert.
CREATE POLICY "kunden_eigene_zeile_lesen"
  ON public.kunden FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));

-- Erlaubt einem angemeldeten Kunden, ausschliesslich seine eigene Zeile zu
-- aendern.
CREATE POLICY "kunden_eigene_zeile_aendern"
  ON public.kunden FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'))
  WITH CHECK (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));

-- Kein Leserecht fuer anon und kein DELETE fuer irgendwen: Kundendaten sind
-- ohne Anmeldung weder lesbar noch loeschbar.


-- ============================ anfragen ======================================

-- Nimmt dem nicht angemeldeten Besucher jedes Leserecht an den Anfragen.
REVOKE ALL ON public.anfragen FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher ausschliesslich, eine Anfrage
-- abzuschicken, damit die Kontaktaufnahme weiter funktioniert.
GRANT INSERT (trainer_id, trainer_name, kunden_email, kunden_name, ziel,
              nachricht, status, weitergeleitet)
  ON public.anfragen TO anon;

-- Gibt dem angemeldeten Nutzer Lese- und Schreibrecht; die Zeilen regeln die
-- Regeln darunter. Kein DELETE.
GRANT SELECT, INSERT ON public.anfragen TO authenticated;

-- Erlaubt dem beteiligten Trainer, den Bearbeitungsstand seiner Anfrage zu
-- setzen; mehr Spalten braucht er dafuer nicht.
GRANT UPDATE (status, weitergeleitet) ON public.anfragen TO authenticated;

-- Laesst das Abschicken einer Anfrage zu.
CREATE POLICY "anfragen_anlegen"
  ON public.anfragen FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Zeigt eine Anfrage nur den beiden Beteiligten: dem Kunden ueber die E-Mail
-- aus seinem Zugangs-Token, dem Trainer ueber die Kennung in trainer_id, die
-- auf seine eigene Zeile zeigt.
CREATE POLICY "anfragen_nur_beteiligte_lesen"
  ON public.anfragen FOR SELECT TO authenticated
  USING (kunden_email = (auth.jwt() ->> 'email')
      OR trainer_id IN (SELECT t.id FROM public.trainers t
                         WHERE t.user_id = auth.uid()));

-- Laesst ausschliesslich den beteiligten Trainer die Anfrage aendern; der
-- Kunde und nicht angemeldete Besucher koennen es nicht.
CREATE POLICY "anfragen_nur_trainer_aendern"
  ON public.anfragen FOR UPDATE TO authenticated
  USING (trainer_id IN (SELECT t.id FROM public.trainers t
                         WHERE t.user_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT t.id FROM public.trainers t
                              WHERE t.user_id = auth.uid()));

-- Kein DELETE fuer irgendwen: eine abgeschickte Anfrage kann ueber den
-- oeffentlichen Schluessel nicht entfernt werden.


-- ================== nachrichten, favoriten, bewertungen =====================
-- Keine dieser drei Tabellen wird von irgendeiner Seite gelesen oder
-- beschrieben. Sie werden vollstaendig gesperrt: alle Rechte entzogen, keine
-- einzige Regel. Bei eingeschaltetem Zeilenschutz und ohne Regel kommt weder
-- ein nicht angemeldeter noch ein angemeldeter Besucher heran. Sobald eine
-- Funktion sie braucht, bekommen sie eigene Regeln.

REVOKE ALL ON public.nachrichten FROM anon, authenticated;
REVOKE ALL ON public.favoriten   FROM anon, authenticated;
REVOKE ALL ON public.bewertungen FROM anon, authenticated;
