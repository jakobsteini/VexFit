-- ============================================================================
-- Vexfit – B4: Warteliste, die Kunden zurückholt (Tabelle + Bestätigung + Abmeldung)
-- Erzeugt am 03.11.2026, korrigiert am 03.11.2026. NICHT eingespielt (nur Datei).
--
-- WARUM DIESE DATEI JETZT DIE TABELLE ANLEGT:
--   Die „Benachrichtige mich"-Einträge liegen in public.trainer_alerts. Diese
--   Tabelle wurde im Code benutzt (kunden-bereich.html, Edge Function
--   trainer-alert, B4 in vexfit-automation), aber NIE durch eine Migration
--   angelegt. Live gibt es sie nicht – der frühere Stand dieser Datei scheiterte
--   deshalb mit „42P01: relation public.trainer_alerts does not exist". Jetzt
--   legt die Datei die Tabelle selbst an (CREATE TABLE IF NOT EXISTS) und ergänzt
--   erst danach das Abmelde-Token und die Indizes.
--
--   Das ist NICHT dieselbe Tabelle wie public.warteliste (die existiert live und
--   bleibt unangetastet): warteliste merkt sich per user_id Orte ohne Trainer für
--   den Admin (kein Mailversand). trainer_alerts ist der aktive „Benachrichtige
--   mich"-Dienst per E-Mail (kunden_email, radius, aktiv), den die Edge Function
--   trainer-alert alle 15 Minuten verschickt. Zwei Funktionen, zwei Tabellen.
--
-- SPALTEN – nur das, was der bestehende Code liest/schreibt:
--   kunden-bereich.html  : kunden_email, kunden_name, plz, stadt, radius, aktiv
--   trainer-alert/kern.ts: id,kunden_email,kunden_name,plz,stadt,radius (ALERT_SPALTEN)
--   B4 vexfit-automation : id,kunden_email,kunden_name,plz,stadt,abmelde_token,aktiv
--   Dazu Primärschlüssel id, Zeitstempel erstellt_am, Abmelde-Token.
--
-- BEDEUTUNG VON aktiv:
--   aktiv = true   -> der Kunde wartet noch auf eine Benachrichtigung.
--   aktiv = false  -> erledigt: entweder er wurde über einen Trainer in seiner
--                     PLZ-Region informiert (B4, Freigabe) ODER er hat sich
--                     abgemeldet. In beiden Fällen bekommt er keine Mail mehr.
--
-- ZUGRIFF (Zeilenschutz an, eng gefasst, wie bei public.warteliste):
--   - Angemeldete Kunden dürfen NUR eigene Zeilen anlegen und lesen
--     (kunden_email = eigene E-Mail aus dem JWT). Das Admin-Konto liest alles
--     über die vorhandene Hilfsfunktion public.ist_vexfit_admin() (nur verwendet,
--     nicht verändert).
--   - Das abmelde_token wird der Rolle authenticated NICHT zum Lesen gegeben
--     (spaltengenaues SELECT-Recht ohne token); es bleibt dem service_role-Zugang
--     der Edge Function vorbehalten und wird nie nach außen sichtbar.
--   - Niemand darf löschen oder ändern; der Versand/das Schließen läuft über die
--     Edge Function (service_role) und umgeht RLS. KEINE Lockerung bestehender
--     Regeln – es werden nur die Regeln dieser neuen Tabelle gesetzt.
--
-- VORAUSSETZUNG: public.ist_vexfit_admin() (aus 2026-09-20-admin-vollzugriff.sql),
--   hier nur verwendet.
--
-- Mehrfach ausführbar (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- RÜCKNAHME: 2026-11-03-02-warteliste-mail-ruecknahme.sql.
-- ============================================================================

-- 1) Tabelle anlegen (falls noch nicht vorhanden). Spalten nur aus dem Code.
CREATE TABLE IF NOT EXISTS public.trainer_alerts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  kunden_email  text        NOT NULL,
  kunden_name   text,
  plz           text,
  stadt         text,
  radius        integer,
  aktiv         boolean     NOT NULL DEFAULT true
);

COMMENT ON TABLE public.trainer_alerts IS
  'Aktive „Benachrichtige mich"-Wünsche der Kunden (E-Mail-Benachrichtigung über die Edge Function trainer-alert). Nicht zu verwechseln mit public.warteliste (Nachfrage ohne Angebot, per user_id, ohne Mail).';

-- Zeilenschutz an; ohne passende Regel danach kein Zugriff.
ALTER TABLE public.trainer_alerts ENABLE ROW LEVEL SECURITY;

-- Standardrechte entziehen, dann nur die unten vergebenen gelten lassen.
REVOKE ALL ON public.trainer_alerts FROM anon, authenticated;

-- Anlegen: nur die Datenspalten einer eigenen Zeile; id, Zeitpunkt, Token aus Vorgaben.
GRANT INSERT (kunden_email, kunden_name, plz, stadt, radius, aktiv)
  ON public.trainer_alerts TO authenticated;

-- Lesen: spaltengenau OHNE abmelde_token, damit das Token nie nach außen gelangt.
GRANT SELECT (id, kunden_email, kunden_name, plz, stadt, radius, aktiv, erstellt_am)
  ON public.trainer_alerts TO authenticated;

-- Kunde darf nur Zeilen mit der EIGENEN E-Mail anlegen.
DROP POLICY IF EXISTS "trainer_alerts_eigene_anlegen" ON public.trainer_alerts;
CREATE POLICY "trainer_alerts_eigene_anlegen"
  ON public.trainer_alerts FOR INSERT TO authenticated
  WITH CHECK (kunden_email = (auth.jwt() ->> 'email'));

-- Kunde liest nur eigene Zeilen; das Admin-Konto liest alle.
DROP POLICY IF EXISTS "trainer_alerts_eigene_oder_admin_lesen" ON public.trainer_alerts;
CREATE POLICY "trainer_alerts_eigene_oder_admin_lesen"
  ON public.trainer_alerts FOR SELECT TO authenticated
  USING (kunden_email = (auth.jwt() ->> 'email') OR public.ist_vexfit_admin());

-- 2) Abmelde-Token für den Abmelde-Link (nur in der Tabelle, service_role).
ALTER TABLE public.trainer_alerts
  ADD COLUMN IF NOT EXISTS abmelde_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Bestehende Zeilen ohne Token defensiv nachziehen.
UPDATE public.trainer_alerts
   SET abmelde_token = gen_random_uuid()
 WHERE abmelde_token IS NULL;

-- Schnelles, eindeutiges Nachschlagen beim Abmelde-Link.
CREATE UNIQUE INDEX IF NOT EXISTS trainer_alerts_abmelde_token_idx
  ON public.trainer_alerts (abmelde_token);

-- B4: bei der Freigabe werden offene Einträge einer PLZ gesucht.
CREATE INDEX IF NOT EXISTS trainer_alerts_offen_plz_idx
  ON public.trainer_alerts (plz)
  WHERE aktiv = true;
